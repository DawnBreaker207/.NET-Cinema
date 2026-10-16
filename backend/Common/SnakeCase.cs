using System.Text.Json;

namespace Cinema.Api.Common;

// System.Text.Json has no built-in snake_case policy; Go/TS contract is snake_case.
public sealed class SnakeCaseNamingPolicy : JsonNamingPolicy
{
    public static readonly SnakeCaseNamingPolicy Instance = new();
    public override string ConvertName(string name)
    {
        if (string.IsNullOrEmpty(name)) return name;
        var sb = new System.Text.StringBuilder();
        for (var i = 0; i < name.Length; i++)
        {
            var c = name[i];
            if (char.IsUpper(c))
            {
                if (i > 0) sb.Append('_');
                sb.Append(char.ToLowerInvariant(c));
            }
            else sb.Append(c);
        }
        return sb.ToString();
    }
}
