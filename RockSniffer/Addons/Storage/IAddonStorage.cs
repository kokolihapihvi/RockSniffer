namespace RockSniffer.Addons.Storage
{
    public interface IAddonStorage
    {
        string? GetValue(string addonId, string key);
        void SetValue(string addonId, string key, string value);
    }
}
