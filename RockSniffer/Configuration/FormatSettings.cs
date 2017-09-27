using Newtonsoft.Json;
using System;
using System.Collections.Generic;
using System.Runtime.Serialization;

namespace RockSniffer.Configuration
{
    /// <summary>
    /// Class to hold the config settings
    /// </summary>
    [Serializable]
    public class FormatSettings
    {
        public string timeFormat = @"mm\:ss";
        public string percentageFormat = @"{0:f2}%";
    }
}