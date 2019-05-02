using Newtonsoft.Json;
using System;
using System.IO;

namespace RockSniffer.Configuration
{
    public class Config
    {
        private static readonly string cfiledir = "." + Path.DirectorySeparatorChar + "config" + Path.DirectorySeparatorChar;
        private const string addonFile = "addons.json";
        private const string rpcFile = "rpc.json";
        private const string formatFile = "format.json";
        private const string debugFile = "debug.json";
        private const string outputFile = "output.json";

        public AddonSettings addonSettings;
        public RPCSettings rpcSettings;
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

            //Load settings files
            addonSettings = LoadFile<AddonSettings>(addonFile);
            rpcSettings = LoadFile<RPCSettings>(rpcFile);
            formatSettings = LoadFile<FormatSettings>(formatFile);
            debugSettings = LoadFile<DebugSettings>(debugFile);
            outputSettings = LoadFile<OutputSettings>(outputFile);

            Console.WriteLine("Configuration loaded");

            //Save the resulting JSON
            Save();
        }

        /// <summary>
        /// Load a configuration file
        /// </summary>
        /// <typeparam name="T"></typeparam>
        /// <param name="file"></param>
        /// <returns></returns>
        private T LoadFile<T>(string file) where T : new()
        {
            if(File.Exists(cfiledir + file))
            {
                string str = File.ReadAllText(cfiledir + file);
                return JsonConvert.DeserializeObject<T>(str);
            }

            return new T();
        }

        /// <summary>
        /// Save all settings objects onto disc as JSON
        /// </summary>
        private void Save()
        {
            File.WriteAllText(cfiledir + addonFile, JsonConvert.SerializeObject(addonSettings));
            File.WriteAllText(cfiledir + rpcFile, JsonConvert.SerializeObject(rpcSettings));
            File.WriteAllText(cfiledir + formatFile, JsonConvert.SerializeObject(formatSettings));
            File.WriteAllText(cfiledir + debugFile, JsonConvert.SerializeObject(debugSettings));
            File.WriteAllText(cfiledir + outputFile, JsonConvert.SerializeObject(outputSettings));
        }
    }
}
