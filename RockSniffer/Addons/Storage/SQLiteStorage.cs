using System;
using System.Data.SQLite;
using System.IO;
using System.Text.RegularExpressions;

namespace RockSniffer.Addons.Storage
{
    public partial class SQLiteStorage : IAddonStorage
    {
        private SQLiteConnection Connection { get; }
        
        [GeneratedRegex("^[a-zA-Z0-9_]{1,64}\\z")]
        private static partial Regex AddonIdRegex();
        private static readonly Regex ValidAddonIdRegex = AddonIdRegex();

        public SQLiteStorage()
        {
            if (!File.Exists("addonstorage.sqlite"))
            {
                SQLiteConnection.CreateFile("addonstorage.sqlite");
            }
            
            Environment.SetEnvironmentVariable("SQLite_ConfigureDirectory", ".");
            Connection = new SQLiteConnection("Data Source=addonstorage.sqlite;");
            Connection.Open();
        }

        private static bool IsValidAddonId(string addonId)
        {
            return ValidAddonIdRegex.IsMatch(addonId);
        }

        private void CreateTable(string addonId)
        {
            if (!IsValidAddonId(addonId))
            {
                throw new ArgumentException("Invalid addon id", nameof(addonId));
            }
            
            var q = $@"
            CREATE TABLE IF NOT EXISTS `{addonId}` (
	            `id`	INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
	            `key`	TEXT NOT NULL,
	            `value`	TEXT
            );";

            using (var cmd = Connection.CreateCommand())
            {
                cmd.CommandText = q;
                cmd.ExecuteNonQuery();
            }
        }

        public string? GetValue(string addonId, string key)
        {
            if (!IsValidAddonId(addonId))
            {
                throw new ArgumentException("Invalid addon id", nameof(addonId));
            }
            
            //Make sure the table exists
            CreateTable(addonId);

            using (var cmd = Connection.CreateCommand())
            {
                cmd.CommandText = $"SELECT value FROM `{addonId}` WHERE key=@key";

                cmd.Parameters.AddWithValue("@key", key);

                return (string?)cmd.ExecuteScalar();
            }
        }

        public void SetValue(string addonId, string key, string value)
        {
            if (!IsValidAddonId(addonId))
            {
                throw new ArgumentException("Invalid addon id", nameof(addonId));
            }
            
            Console.WriteLine($"Storing {addonId}/{key} ({value.Length} bytes)");

            //Make sure the table exists
            CreateTable(addonId);

            //Attempt to update the table
            using (var cmd = Connection.CreateCommand())
            {
                cmd.CommandText = $"UPDATE `{addonId}` SET value=@value WHERE key=@key";

                cmd.Parameters.AddWithValue("@value", value);
                cmd.Parameters.AddWithValue("@key", key);

                //If update changed more than 0 rows, return
                if (cmd.ExecuteNonQuery() > 0)
                {
                    return;
                }
            }

            using (var cmd = Connection.CreateCommand())
            {
                cmd.CommandText = $@"INSERT INTO `{addonId}`(key, value) VALUES(@key, @value)";

                cmd.Parameters.AddWithValue("@value", value);
                cmd.Parameters.AddWithValue("@key", key);

                cmd.ExecuteNonQuery();
            }
        }
    }
}
