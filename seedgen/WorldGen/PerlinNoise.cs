using System;
using System.IO;
using System.Runtime.InteropServices;

namespace Vh.Numerics;

/// <summary>
/// Exact reimplementation of Unity's Mathf.PerlinNoise, based on Ghidra decompilation
/// from the Valhalla project (https://github.com/PeriodicSeizures/Valhalla).
/// Uses Ken Perlin's improved noise (2002) with abs(x), abs(y) and custom normalization.
///
/// When perlin_native.dll is present, uses P/Invoke to match Unity's MSVC-compiled
/// float arithmetic exactly (bit-for-bit). Falls back to managed C# otherwise.
/// </summary>
public static class PerlinNoise
{
    [DllImport("perlin_native", CallingConvention = CallingConvention.Cdecl, EntryPoint = "PerlinNoise")]
    private static extern float NativeNoise(float x, float y);

    private static readonly bool _useNative;

    static PerlinNoise()
    {
        // Try to load native DLL for bit-exact Unity match
        try
        {
            // Test call to verify DLL is loadable
            float test = NativeNoise(0f, 0f);
            _useNative = true;
            Console.WriteLine($"Using native Perlin noise (perlin_native.dll) - test(0,0)={test:R}");
        }
        catch (DllNotFoundException)
        {
            _useNative = false;
            Console.WriteLine("Native Perlin DLL not found, using managed C# implementation");
        }
    }

    /// <summary>
    /// Compute Perlin noise matching Unity's Mathf.PerlinNoise.
    /// Uses native DLL if available for bit-exact match, otherwise managed C#.
    /// Returns a value approximately in [0, 1].
    /// PerlinNoise(0, 0) = 0.4652731
    /// </summary>
    public static float Noise(float x, float y)
    {
        if (_useNative)
            return NativeNoise(x, y);
        return ManagedNoise(x, y);
    }

    // Standard permutation table from Ken Perlin's reference, doubled to 512
    private static readonly int[] p = {
        151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
        8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,
        117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,
        71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,
        41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,
        89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,
        226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,
        17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,
        167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,
        246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,
        239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,
        254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180,
        // 2nd copy
        151,160,137,91,90,15,131,13,201,95,96,53,194,233,7,225,140,36,103,30,69,142,
        8,99,37,240,21,10,23,190,6,148,247,120,234,75,0,26,197,62,94,252,219,203,
        117,35,11,32,57,177,33,88,237,149,56,87,174,20,125,136,171,168,68,175,74,165,
        71,134,139,48,27,166,77,146,158,231,83,111,229,122,60,211,133,230,220,105,92,
        41,55,46,245,40,244,102,143,54,65,25,63,161,1,216,80,73,209,76,132,187,208,
        89,18,169,200,196,135,130,116,188,159,86,164,100,109,198,173,186,3,64,52,217,
        226,250,124,123,5,202,38,147,118,126,255,82,85,212,207,206,59,227,47,16,58,
        17,182,189,28,42,223,183,170,213,119,248,152,2,44,154,163,70,221,153,101,155,
        167,43,172,9,129,22,39,253,19,98,108,110,79,113,224,232,178,185,112,104,218,
        246,97,228,251,34,242,193,238,210,144,12,191,179,162,241,81,51,145,235,249,14,
        239,107,49,192,214,31,181,199,106,157,184,84,204,176,115,121,50,45,127,4,150,
        254,138,236,205,93,222,114,67,29,24,72,243,141,128,195,78,66,215,61,156,180
    };

    private static float Fade(float t)
    {
        return t * t * t * (t * (t * 6f - 15f) + 10f);
    }

    private static float Lerp(float t, float a, float b)
    {
        return a + t * (b - a);
    }

    private static float Grad(int hash, float x, float y)
    {
        int h = hash & 15;
        float u = h < 8 ? x : y;
        float v = h < 4 ? y : (h == 12 || h == 14 ? x : 0);
        return ((h & 1) == 0 ? u : -u) + ((h & 2) == 0 ? v : -v);
    }

    private static float ManagedNoise(float x, float y)
    {
        x = Math.Abs(x);
        y = Math.Abs(y);

        int X = (int)x & 0xFF;
        int Y = (int)y & 0xFF;

        x -= (int)x;
        y -= (int)y;

        // Unity safety clamp: due to float precision, x/y can be >= 1.0
        // for inputs very close to integer boundaries (e.g., 4.9999995f).
        x = Math.Min(1.0f, x);
        y = Math.Min(1.0f, y);

        int A = p[X] + Y;
        int B = p[X + 1] + Y;

        int AA = p[p[A]];
        int BA = p[p[B]];
        int AB = p[p[A + 1]];
        int BB = p[p[B + 1]];

        float u = Fade(x);
        float v = Fade(y);

        float res = Lerp(v,
            Lerp(u, Grad(AA, x, y), Grad(BA, x - 1, y)),
            Lerp(u, Grad(AB, x, y - 1), Grad(BB, x - 1, y - 1)));

        return (res + 0.69f) / 1.483f;
    }
}
