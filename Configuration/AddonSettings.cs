using System;

namespace RockSniffer.Configuration
{
    [Serializable]
    public class AddonSettings
    {
        public string _NOTE = "Enabling addons will enable a local web server, listening on localhost port 9938";
        public bool enableAddons = false;
    }
}
