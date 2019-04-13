using System.Collections.Generic;

namespace RockSniffer.Addons.Storage
{
    public class MemoryStorage : IAddonStorage
    {
        public Dictionary<string, Dictionary<string, string>> storage = new Dictionary<string, Dictionary<string, string>>();

        public string GetValue(string addonid, string key)
        {
            if (storage.ContainsKey(addonid))
            {
                if (storage[addonid].ContainsKey(key))
                {
                    return storage[addonid][key];
                }
            }

            return null;
        }

        public void SetValue(string addonid, string key, string value)
        {
            if (!storage.ContainsKey(addonid))
            {
                storage.Add(addonid, new Dictionary<string, string>());
            }

            if (!storage[addonid].ContainsKey(key))
            {
                storage[addonid].Add(key, value);
            }

            storage[addonid][key] = value;
        }
    }
}
