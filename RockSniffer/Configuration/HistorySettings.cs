namespace RockSniffer.Configuration
{
    public class HistorySettings
    {
        public bool enableSqliteHistory = false;
        public string sqliteHistoryPath = "output/playthrough_history.db";
        public bool enableCsvHistory = false;
        public string csvHistoryPath = "output/playthrough_history.csv";
    }
}
