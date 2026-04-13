using System;

namespace Vh.Numerics;

public struct Vector3
{
    public float x, y, z;

    public Vector3(float x, float y, float z) { this.x = x; this.y = y; this.z = z; }

    public override string ToString() => $"({x},{y},{z})";

    public float Length() => (float)System.Math.Sqrt((double)x * x + y * y + z * z);

    public void Normalise(float length = 1.0f) => Scale(length / Length());

    public void Scale(float factor)
    {
        x *= factor;
        y *= factor;
        z *= factor;
    }

    public static Vector3 operator *(Vector3 a, float d) => new(a.x * d, a.y * d, a.z * d);
    public static Vector3 operator *(float d, Vector3 a) => new(a.x * d, a.y * d, a.z * d);
}
