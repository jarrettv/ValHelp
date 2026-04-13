using System;

namespace Vh.Numerics;

/// <summary>
/// Exact reimplementation of Unity's UnityEngine.Random (Xorshift128).
/// Based on Ghidra decompilation from the Valhalla project and macklinb's gist.
/// </summary>
public static class UnityRandom
{
    private static uint s0, s1, s2, s3;

    /// <summary>
    /// Initialize state using MT19937-style expansion (matches Unity's InitState).
    /// </summary>
    public static void InitState(int seed)
    {
        s0 = (uint)seed;
        s1 = s0 * 0x6C078965u + 1u;
        s2 = s1 * 0x6C078965u + 1u;
        s3 = s2 * 0x6C078965u + 1u;
    }

    /// <summary>
    /// Standard Xorshift128 step. Matches Unity's native implementation.
    /// From macklinb's verified gist: w ^ (w >> 19) ^ t ^ (t >> 8)
    /// </summary>
    private static uint NextUint()
    {
        uint t = s0;
        t ^= t << 11;
        t ^= t >> 8;
        s0 = s1;
        s1 = s2;
        s2 = s3;
        s3 = s3 ^ (s3 >> 19) ^ t;
        return s3;
    }

    /// <summary>Returns a float in [0, 1]. Matches Unity's Random.value.</summary>
    public static float Value()
    {
        uint raw = NextUint();
        return (raw & 0x7FFFFF) / 8388607.0f;
    }

    /// <summary>
    /// Core float range implementation matching Unity's native RangedRandom.
    /// Verified against BepInEx capture: (min-max) * t + max where t = (raw &amp; 0x7FFFFF) / 0x7FFFFF.
    /// </summary>
    private static float RangedRandomInternal(float min, float max)
    {
        uint raw = NextUint();
        float t = (raw & 0x7FFFFF) / 8388607.0f;
        return (min - max) * t + max;
    }

    /// <summary>Matches UnityEngine.Random.Range(float, float).</summary>
    public static float Range(float min, float max)
    {
        return RangedRandomInternal(min, max);
    }

    /// <summary>Matches UnityEngine.Random.Range(int minInclusive, int maxExclusive).</summary>
    public static int Range(int min, int maxExclusive)
    {
        if (min > maxExclusive)
        {
            (min, maxExclusive) = (maxExclusive, min);
        }
        uint diff = (uint)(maxExclusive - min);
        if (diff > 0)
        {
            uint raw = NextUint();
            return min + (int)(raw % diff);
        }
        return min;
    }

    /// <summary>Expose NextUint for testing.</summary>
    public static uint NextUintPublic() => NextUint();

    /// <summary>Matches Unity's Random.insideUnitCircle (polar coordinates, exactly 2 NextUint calls).</summary>
    public static (float x, float y) InsideUnitCircle()
    {
        float angle = RangedRandomInternal(0f, MathF.PI * 2f);
        float r = MathF.Sqrt(RangedRandomInternal(0f, 1f));
        return (r * MathF.Cos(angle), r * MathF.Sin(angle));
    }

    public static (uint, uint, uint, uint) GetState() => (s0, s1, s2, s3);
    public static void SetState(uint a, uint b, uint c, uint d) { s0 = a; s1 = b; s2 = c; s3 = d; }
}
