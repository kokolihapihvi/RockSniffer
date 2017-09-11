using Newtonsoft.Json;
using System;
using System.IO;

namespace RockSniffer.Configuration
{
    public class Config
    {
        private static readonly string cfiledir = "." + Path.DirectorySeparatorChar + "config" + Path.DirectorySeparatorChar;
        private const string addonFile = "addons.json";
        private const string formatFile = "format.json";
        private const string debugFile = "debug.json";
        private const string outputFile = "output.json";

        public AddonSettings addonSettings;
        public FormatSettings formatSettings;
        public DebugSettings debugSettings;
        public OutputSettings outputSettings;

        /// <summary>
        /// Load JSON files from disc or initialize default values and write all configuration files to disc
        /// </summary>
        internal void Load()
        {
            //Create the config directory if it doesn't exist
            Directory.CreateDirectory(cfiledir);

            //Set convert settings to output pretty indented json
            JsonConvert.DefaultSettings = () => new JsonSerializerSettings { Formatting = Formatting.Indented };

            //Initialize settings
            addonSettings = new AddonSettings();
            formatSettings = new FormatSettings();
            debugSettings = new DebugSettings();
            outputSettings = new OutputSettings();

            string confString = "";

            //Load addon configuration
            if (File.Exists(cfiledir + addonFile))
            {
                confString = File.ReadAllText(cfiledir + addonFile);
                addonSettings = JsonConvert.DeserializeObject<AddonSettings>(confString);
            }

            //Load format configuration
            if (File.Exists(cfiledir + formatFile))
            {
                confString = File.ReadAllText(cfiledir + formatFile);
                formatSettings = JsonConvert.DeserializeObject<FormatSettings>(confString);
            }

            //Load debug configuration
            if (File.Exists(cfiledir + debugFile))
            {
                confString = File.ReadAllText(cfiledir + debugFile);
                debugSettings = JsonConvert.DeserializeObject<DebugSettings>(confString);
            }

            //Load output configuration
            if (File.Exists(cfiledir + outputFile))
            {
                confString = File.ReadAllText(cfiledir + outputFile);
                outputSettings = JsonConvert.DeserializeObject<OutputSettings>(confString);
            }

            Console.WriteLine("Configuration loaded");

            //Save the resulting JSON
            Save();
        }

        /// <summary>
        /// Save all settings objects onto disc as JSON
        /// </summary>
        private void Save()
        {
            File.WriteAllText(cfiledir + addonFile, JsonConvert.SerializeObject(addonSettings));
            File.WriteAllText(cfiledir + formatFile, JsonConvert.SerializeObject(formatSettings));
            File.WriteAllText(cfiledir + debugFile, JsonConvert.SerializeObject(debugSettings));
            File.WriteAllText(cfiledir + outputFile, JsonConvert.SerializeObject(outputSettings));
        }
    }
}
