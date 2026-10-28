using System;

namespace Vh.Numerics;

/// <summary>
/// UnityEngine.Vector2 (UnityEngine.CoreModule) as it runs in the game: under
/// Mono, a float expression is evaluated in double and only rounded to float when
/// stored or passed on, so <c>x * x + y * y</c> is a double sum (the river
/// network shows the game does this). Also Unity's approximate <c>==</c>.
/// </summary>
public struct Vector2
{
    public float x, y;

    public Vector2(float x, float y) { this.x = x; this.y = y; }

    public float magnitude => (float)System.Math.Sqrt((double)x * x + (double)y * y);

    public Vector2 normalized
    {
        get
        {
            float m = magnitude;
            if (m > 1E-05f) return new Vector2(x / m, y / m);
            return new Vector2(0, 0);
        }
    }

    public static Vector2 zero => new(0, 0);

    public static float Distance(Vector2 a, Vector2 b)
    {
        float dx = a.x - b.x;
        float dy = a.y - b.y;
        return (float)System.Math.Sqrt((double)dx * dx + (double)dy * dy);
    }

    public static float SqrMagnitude(Vector2 v)
    {
        return (float)((double)v.x * v.x + (double)v.y * v.y);
    }

    public static Vector2 operator +(Vector2 a, Vector2 b) => new(a.x + b.x, a.y + b.y);
    public static Vector2 operator -(Vector2 a, Vector2 b) => new(a.x - b.x, a.y - b.y);
    public static Vector2 operator *(Vector2 a, float d) => new(a.x * d, a.y * d);
    public static Vector2 operator *(float d, Vector2 a) => new(a.x * d, a.y * d);

    /// <summary>Unity's: equal when within about 1e-5 of each other.</summary>
    public static bool operator ==(Vector2 a, Vector2 b)
    {
        float dx = a.x - b.x;
        float dy = a.y - b.y;
        return (double)dx * dx + (double)dy * dy < 9.9999994E-11f;
    }
    public static bool operator !=(Vector2 a, Vector2 b) => !(a == b);

    public override bool Equals(object? obj) => obj is Vector2 v && this == v;
    public override int GetHashCode() => HashCode.Combine(x, y);
}
