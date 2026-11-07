using System.Collections.Generic;

namespace RockSniffer.Addons.Storage
{
    public class MemoryStorage : IAddonStorage
    {
        private readonly Dictionary<string, Dictionary<string, string>> storage = new Dictionary<string, Dictionary<string, string>>();

        public string? GetValue(string addonId, string key)
        {
            if (storage.ContainsKey(addonId))
            {
                if (storage[addonId].ContainsKey(key))
                {
                    return storage[addonId][key];
                }
            }

            return null;
        }

        public void SetValue(string addonId, string key, string value)
        {
            if (!storage.ContainsKey(addonId))
            {
                storage.Add(addonId, new Dictionary<string, string>());
            }

            if (!storage[addonId].ContainsKey(key))
            {
                storage[addonId].Add(key, value);
            }

            storage[addonId][key] = value;
        }
    }
}
