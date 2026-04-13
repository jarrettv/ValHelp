namespace SeedGen;

/// <summary>
/// Port of Valheim's string.GetStableHashCode() — DJB2 variant.
/// </summary>
public static class ValheimSeedHash
{
    public static int GetStableHashCode(string str)
    {
        int hash1 = 5381;
        int hash2 = hash1;
        for (int i = 0; i < str.Length; i += 2)
        {
            hash1 = ((hash1 << 5) + hash1) ^ str[i];
            if (i + 1 < str.Length)
                hash2 = ((hash2 << 5) + hash2) ^ str[i + 1];
        }
        return hash1 + hash2 * 1566083941;
    }
}
