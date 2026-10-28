using System;

namespace Vh.Numerics;

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
            if (m < 1e-10f) return new Vector2(0, 0);
            return new Vector2(x / m, y / m);
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
        return v.x * v.x + v.y * v.y;
    }

    public static Vector2 operator +(Vector2 a, Vector2 b) => new(a.x + b.x, a.y + b.y);
    public static Vector2 operator -(Vector2 a, Vector2 b) => new(a.x - b.x, a.y - b.y);
    public static Vector2 operator *(Vector2 a, float d) => new(a.x * d, a.y * d);
    public static Vector2 operator *(float d, Vector2 a) => new(a.x * d, a.y * d);

    public static bool operator ==(Vector2 a, Vector2 b) => a.x == b.x && a.y == b.y;
    public static bool operator !=(Vector2 a, Vector2 b) => !(a == b);

    public override bool Equals(object? obj) => obj is Vector2 v && this == v;
    public override int GetHashCode() => HashCode.Combine(x, y);
}
