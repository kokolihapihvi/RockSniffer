namespace RockSniffer.Addons.Storage
{
    public interface IAddonStorage
    {
        string GetValue(string addonid, string key);
        void SetValue(string addonid, string key, string value);
    }
}
