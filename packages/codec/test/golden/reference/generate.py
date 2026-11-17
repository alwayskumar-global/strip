#!/usr/bin/env python3
"""Independent reference for @strip/codec format version 1.

Written from .kiro/specs/codec/design.md only (Wire formats, Deterministic generation, Encoder).
Uses only the Python standard library: hashlib (SHA-256), zlib (CRC-32), and its own SplitMix32,
xoshiro128**, integer fixed-point robust soliton table, neighbor selection (systematic, dense, sparse)
and packet framing. Output: ../vectors.json. Run: python3 generate.py
"""
import hashlib
import json
import math
import os
import struct
import zlib

M = 0xFFFFFFFF
C = (1, 10)
DELTA = (1, 2)
D = 3
F = 1 << 48
LN2_Q48 = 195103586505167


def rotl(x, k):
    return ((x << k) | (x >> (32 - k))) & M


class Prng:
    """xoshiro128** 1.1 seeded by SplitMix32 from (session, seq)."""

    def __init__(self, session, seq):
        state = (session ^ ((seq * 0x9E3779B1) & M)) & M
        self.seed = state
        s = []
        for _ in range(4):
            state = (state + 0x9E3779B9) & M
            z = state
            z = ((z ^ (z >> 16)) * 0x85EBCA6B) & M
            z = ((z ^ (z >> 13)) * 0xC2B2AE35) & M
            s.append((z ^ (z >> 16)) & M)
        if all(v == 0 for v in s):
            s[0] = 1
        self.s = s
        self.initial = list(s)

    def next(self):
        s = self.s
        result = (rotl((s[1] * 5) & M, 7) * 9) & M
        t = (s[1] << 9) & M
        s[2] ^= s[0]
        s[3] ^= s[1]
        s[1] ^= s[2]
        s[0] ^= s[3]
        s[2] ^= t
        s[3] = rotl(s[3], 11)
        return result

    def bounded(self, n):
        if n == 1:
            return 0
        if n == 1 << 32:
            return self.next()
        bits = (n - 1).bit_length()
        while True:
            x = self.next() >> (32 - bits)
            if x < n:
                return x


def lnq(v):
    n = v.bit_length() - 1
    m = v >> (n - 48) if n >= 48 else v << (48 - n)
    frac = 0
    for _ in range(48):
        m = (m * m) >> 48
        frac <<= 1
        if m >= 2 * F:
            m >>= 1
            frac |= 1
    log2q = ((n - 48) << 48) + frac
    return (log2q * LN2_Q48) >> 48


def soliton(K, c=C, delta=DELTA):
    cn, cd = c
    dn, dd = delta
    sq = math.isqrt(K << 96)
    lnkd = lnq(((K * dd) << 48) // dn)
    s = (((lnkd * sq) // F) * cn) // cd
    if s < F:
        s = F
    pivot = max(1, min(K, (K * F) // s))
    cum = [0] * (K + 1)
    acc = 0
    for i in range(1, K + 1):
        w = F // K if i == 1 else F // (i * (i - 1))
        if i < pivot:
            w += s // (K * i)
        elif i == pivot:
            w += ((s * lnq((s * dd) // dn)) // F) // K
        acc += w
        cum[i] = acc
    cum_t = [0] * (K + 1)
    for i in range(1, K):
        cum_t[i] = (cum[i] * (1 << 32)) // acc
    cum_t[K] = 1 << 32
    return cum_t


def sample_degree(cum_t, K, u):
    for i in range(1, K + 1):
        if u < cum_t[i]:
            return i
    return K


def is_dense(seq, K):
    return D > 0 and seq >= K and (seq - K) % D == D - 1


def kind_of(seq, K):
    if seq < K:
        return "systematic"
    return "dense" if is_dense(seq, K) else "sparse"


def dense_words(session, seq, K):
    p = Prng(session, seq)
    return [p.next() for _ in range((K + 31) // 32)]


def dense_set(session, seq, K):
    words = dense_words(session, seq, K)
    out = [b for b in range(K) if (words[b >> 5] >> (b & 31)) & 1]
    if not out:
        out = [seq % K]
    return out


def sparse_set(session, seq, K, cum_t):
    p = Prng(session, seq)
    d = sample_degree(cum_t, K, p.next())
    perm = {}
    out = []
    for j in range(d):
        r = j + p.bounded(K - j)
        pj = perm.get(j, j)
        pr = perm.get(r, r)
        perm[j], perm[r] = pr, pj
        out.append(perm[j])
    return out


_tables = {}


def table(K):
    if K not in _tables:
        _tables[K] = soliton(K)
    return _tables[K]


def neighbors(session, seq, K):
    if seq < K:
        return [seq]
    if is_dense(seq, K):
        return sorted(dense_set(session, seq, K))
    return sorted(sparse_set(session, seq, K, table(K)))


def make_case(name, payload, file_name, mime, packet_size, emit_extra):
    name_b = file_name.encode("utf-8")
    mime_b = mime.encode("ascii")
    record = bytes([1]) + struct.pack(">H", len(name_b)) + name_b + bytes([len(mime_b)]) + mime_b
    record += struct.pack(">I", len(payload)) + hashlib.sha256(payload).digest()
    session = int.from_bytes(hashlib.sha256(record).digest()[:4], "big")
    stream = record + payload
    L = len(stream)
    bs = packet_size - 30
    K = -(-L // bs)
    blocks = [stream[i * bs:(i + 1) * bs].ljust(bs, b"\0") for i in range(K)]
    packets = []
    for seq in range(K + emit_extra):
        block_set = neighbors(session, seq, K)
        body = bytearray(bs)
        for b in block_set:
            for i in range(bs):
                body[i] ^= blocks[b][i]
        header = struct.pack(">HBBIIHII", 0x5354, 1, 0, session, L, bs, K, seq)
        header += struct.pack(">I", zlib.crc32(header))
        pkt = header + bytes(body)
        pkt += struct.pack(">I", zlib.crc32(pkt))
        packets.append({"seq": seq, "kind": kind_of(seq, K), "hex": pkt.hex()})
    return {
        "name": name,
        "payloadHex": payload.hex(),
        "fileName": file_name,
        "mime": mime,
        "packetSize": packet_size,
        "sessionId": session,
        "recordHex": record.hex(),
        "totalLength": L,
        "blockSize": bs,
        "K": K,
        "packets": packets,
    }


def main():
    out = {"formatVersion": 1, "params": {"c": list(C), "delta": list(DELTA), "D": D}}

    out["crc32"] = [
        {"asciiHex": b.hex(), "crc": zlib.crc32(b)}
        for b in (b"123456789", b"", bytes(range(32)), b"The quick brown fox jumps over the lazy dog")
    ]

    prng = []
    for session, seq in ((0x12345678, 0), (0x12345678, 1), (0xDEADBEEF, 4000000000), (0, 0), (0xFFFFFFFF, 0xFFFFFFFF), (0xCAFEF00D, 1234567)):
        p = Prng(session, seq)
        row = {"session": session, "seq": seq, "seed": p.seed, "state": p.initial, "out": [p.next() for _ in range(8)]}
        prng.append(row)
    out["prng"] = prng

    bounded = []
    for session, seq in ((0x12345678, 7), (0xDEADBEEF, 99)):
        p = Prng(session, seq)
        ns = [2, 3, 5, 6, 7, 100, 1000, 65535, 65536, 1 << 32, 1]
        bounded.append({"session": session, "seq": seq, "ns": ns, "values": [p.bounded(n) for n in ns]})
    out["bounded"] = bounded

    sol = []
    for K in (1, 2, 12, 50):
        sol.append({"K": K, "cumT": table(K)})
    out["soliton"] = sol
    out["solitonDigests"] = [
        {"K": K, "sha256": hashlib.sha256(",".join(str(v) for v in table(K)[1:]).encode()).hexdigest()}
        for K in (359, 1000, 4000)
    ]

    out["denseReference"] = [
        {"session": s, "seq": q, "K": K, "words": dense_words(s, q, K), "set": dense_set(s, q, K)}
        for s, q, K in ((0x12345678, 53, 50), (0x12345678, 103, 100), (0xDEADBEEF, 7, 1), (0xDEADBEEF, 7, 5))
    ]

    sets = []
    for K in (12, 50, 359, 1000):
        for seq in (0, K - 1, K, K + 1, K + 2, K + 3, K + 5, K + 8, K + 100, 4294967294, 4294967295):
            sets.append({"session": 0x12345678, "K": K, "seq": seq, "kind": kind_of(seq, K), "set": neighbors(0x12345678, seq, K)})
    out["neighborSets"] = sets

    payload_a = bytes((i * 131 + 17) & 0xFF for i in range(300))
    payload_b = bytes((i * 31 + 7) & 0xFF for i in range(5000))
    payload_c = bytes((i * 7 + 3) & 0xFF for i in range(600))
    out["cases"] = [
        make_case("small-k12", payload_a, "golden.bin", "application/octet-stream", 62, 14),
        make_case("default-size", payload_b, "d\u00e9fault-\u00fc.dat", "text/plain", 2953, 6),
        make_case("dense-heavy", payload_c, "c.bin", "", 46, 24),
    ]

    here = os.path.dirname(os.path.abspath(__file__))
    path = os.path.join(here, "..", "vectors.json")
    with open(path, "w", encoding="utf-8") as f:
        f.write("{\n")
        keys = list(out.keys())
        for i, k in enumerate(keys):
            f.write(json.dumps(k) + ": " + json.dumps(out[k], separators=(",", ":"), ensure_ascii=True))
            f.write(",\n" if i < len(keys) - 1 else "\n")
        f.write("}\n")
    print("wrote", os.path.normpath(path))


if __name__ == "__main__":
    main()
