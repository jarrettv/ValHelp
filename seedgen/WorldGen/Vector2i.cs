using System;

namespace Vh.Numerics;

public struct Vector2i : IEquatable<Vector2i>
{
    public int x, y;

    public Vector2i(int x, int y) { this.x = x; this.y = y; }

    public override string ToString() => $"({x},{y})";

    public bool Equals(Vector2i other) => x == other.x && y == other.y;

    public override bool Equals(object? obj) => obj is Vector2i other && Equals(other);

    public override int GetHashCode() => HashCode.Combine(x, y);

    public static bool operator ==(Vector2i left, Vector2i right) => left.Equals(right);

    public static bool operator !=(Vector2i left, Vector2i right) => !left.Equals(right);
}
