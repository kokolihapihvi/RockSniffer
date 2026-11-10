using RockSnifferLib.RSHelpers;
using RockSnifferLib.RSHelpers.NoteData;
using RockSnifferLib.Logging;
using RockSnifferLib.Sniffing;
using System;
using System.Data.SQLite;
using System.Globalization;
using System.IO;
using System.Text;

namespace RockSniffer.History
{
    /// <summary>
    /// Writes one row per playthrough to SQLite and/or CSV
    /// </summary>
    public class PlaythroughHistory
    {
        private readonly string sqlitePath;
        private readonly string csvPath;
        private bool sqliteEnabled;
        private bool csvEnabled;

        private SQLiteConnection sqliteConnection;
        private DateTime metadataTimestamp;
        private DateTime actualStartTimestamp;
        private DateTime actualEndTimestamp;

        public PlaythroughHistory(bool enableSqlite, string sqlitePath, bool enableCsv, string csvPath)
        {
            this.sqliteEnabled = enableSqlite;
            this.sqlitePath = sqlitePath;
            this.csvEnabled = enableCsv;
            this.csvPath = csvPath;

            if (sqliteEnabled)
            {
                InitializeSqlite();
            }

            if (csvEnabled)
            {
                InitializeCsv();
            }
        }

        private void InitializeSqlite()
        {
            try
            {
                bool isNewDatabase = !File.Exists(sqlitePath);

                sqliteConnection = new SQLiteConnection($"Data Source={sqlitePath};Version=3;");
                sqliteConnection.Open();

                if (isNewDatabase)
                {
                    CreateTables();
                }
            }
            catch (Exception ex)
            {
                Logger.LogError("Error initializing SQLite: {0}", ex.Message);
                sqliteEnabled = false;
            }
        }

        private void CreateTables()
        {
            string createTableQuery = @"
                CREATE TABLE IF NOT EXISTS playthrough_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    timestamp TEXT NOT NULL,
                    timestamp_start TEXT NOT NULL,
                    timestamp_end TEXT NOT NULL,
                    song_id TEXT,
                    song_name TEXT,
                    artist_name TEXT,
                    album_name TEXT,
                    album_year INTEGER,
                    song_length REAL,
                    arrangement_id TEXT,
                    arrangement_path TEXT,
                    arrangement_tuning TEXT,
                    game_mode TEXT,
                    author TEXT,
                    total_notes INTEGER,
                    notes_hit INTEGER,
                    notes_missed INTEGER,
                    highest_hit_streak INTEGER,
                    accuracy REAL,
                    completed INTEGER,
                    paused INTEGER,
                    -- Score Attack specific fields (NULL for Learn A Song)
                    total_perfect_hits INTEGER,
                    perfect_phrases INTEGER,
                    good_phrases INTEGER,
                    passed_phrases INTEGER,
                    failed_phrases INTEGER,
                    highest_perfect_phrase_streak INTEGER,
                    highest_good_phrase_streak INTEGER,
                    highest_passed_phrase_streak INTEGER,
                    highest_failed_phrase_streak INTEGER,
                    current_score INTEGER,
                    highest_multiplier INTEGER
                );";

            using (var command = new SQLiteCommand(createTableQuery, sqliteConnection))
            {
                command.ExecuteNonQuery();
            }
        }

        private void InitializeCsv()
        {
            try
            {
                if (!File.Exists(csvPath))
                {
                    string header =
                        "Timestamp,TimestampStart,TimestampEnd,SongID,SongName,ArtistName,AlbumName,AlbumYear,SongLength," +
                        "ArrangementID,ArrangementPath,ArrangementTuning,GameMode,Author,TotalNotes,NotesHit,NotesMissed," +
                        "HighestHitStreak,Accuracy,Completed,Paused," +
                        "TotalPerfectHits,PerfectPhrases,GoodPhrases,PassedPhrases,FailedPhrases," +
                        "HighestPerfectPhraseStreak,HighestGoodPhraseStreak,HighestPassedPhraseStreak,HighestFailedPhraseStreak," +
                        "CurrentScore,HighestMultiplier" + Environment.NewLine;
                    File.WriteAllText(csvPath, header);
                }
            }
            catch (Exception ex)
            {
                Logger.LogError("Error initializing CSV: {0}", ex.Message);
                csvEnabled = false;
            }
        }

        public void OnSongSelected()
        {
            metadataTimestamp = DateTime.Now;
        }

        public void OnSongStarted(RockSnifferLib.Events.OnSongStartedArgs e)
        {
            actualStartTimestamp = e.timestamp;
        }

        public void OnSongEnded(RockSnifferLib.Events.OnSongEndedArgs e)
        {
            // Note data is single-player only
            if (e.wasMultiplayerMode)
            {
                return;
            }

            actualEndTimestamp = e.timestamp;

            var readout = e.readout ?? new RSMemoryReadout();
            string arrangementID = e.arrangementID ?? "";

            if (sqliteEnabled)
            {
                LogToSqlite(e.song, readout, e.completed, e.paused, arrangementID, e.path, e.tuning);
            }

            if (csvEnabled)
            {
                LogToCsv(e.song, readout, e.completed, e.paused, arrangementID, e.path, e.tuning);
            }
        }

        private void LogToSqlite(SongDetails song, RSMemoryReadout readout, bool completed, bool paused,
                                  string resolvedArrangementID, string resolvedPath, string resolvedTuning)
        {
            try
            {
                // Null outside Score Attack, which leaves those columns empty
                ScoreAttackNoteData? saData = readout.mode == RSMode.SCOREATTACK && readout.noteData is ScoreAttackNoteData sa ? sa : null;

                string insertQuery = @"
                    INSERT INTO playthrough_history 
                    (timestamp, timestamp_start, timestamp_end, song_id, song_name, artist_name, album_name, album_year, song_length, 
                     arrangement_id, arrangement_path, arrangement_tuning, game_mode, author, total_notes, notes_hit, notes_missed, 
                     highest_hit_streak, accuracy, completed, paused,
                     total_perfect_hits, perfect_phrases, good_phrases, passed_phrases, failed_phrases,
                     highest_perfect_phrase_streak, highest_good_phrase_streak, highest_passed_phrase_streak, highest_failed_phrase_streak,
                     current_score, highest_multiplier)
                    VALUES 
                    (@timestamp, @timestamp_start, @timestamp_end, @song_id, @song_name, @artist_name, @album_name, @album_year, @song_length,
                     @arrangement_id, @arrangement_path, @arrangement_tuning, @game_mode, @author, @total_notes, @notes_hit, @notes_missed,
                     @highest_hit_streak, @accuracy, @completed, @paused,
                     @total_perfect_hits, @perfect_phrases, @good_phrases, @passed_phrases, @failed_phrases,
                     @highest_perfect_phrase_streak, @highest_good_phrase_streak, @highest_passed_phrase_streak, @highest_failed_phrase_streak,
                     @current_score, @highest_multiplier)";

                using (var command = new SQLiteCommand(insertQuery, sqliteConnection))
                {
                    command.Parameters.AddWithValue("@timestamp", metadataTimestamp.ToString("yyyy-MM-dd HH:mm:ss"));
                    command.Parameters.AddWithValue("@timestamp_start", actualStartTimestamp.ToString("yyyy-MM-dd HH:mm:ss"));
                    command.Parameters.AddWithValue("@timestamp_end", actualEndTimestamp.ToString("yyyy-MM-dd HH:mm:ss"));
                    command.Parameters.AddWithValue("@song_id", song.songID ?? "");
                    command.Parameters.AddWithValue("@song_name", song.songName ?? "");
                    command.Parameters.AddWithValue("@artist_name", song.artistName ?? "");
                    command.Parameters.AddWithValue("@album_name", song.albumName ?? "");
                    command.Parameters.AddWithValue("@album_year", song.albumYear);
                    command.Parameters.AddWithValue("@song_length", song.songLength);
                    command.Parameters.AddWithValue("@arrangement_id", resolvedArrangementID ?? "");
                    command.Parameters.AddWithValue("@arrangement_path", resolvedPath ?? "");
                    command.Parameters.AddWithValue("@arrangement_tuning", resolvedTuning ?? "");
                    command.Parameters.AddWithValue("@game_mode", readout.mode.ToString());
                    command.Parameters.AddWithValue("@author", song.toolkit?.author ?? "");
                    command.Parameters.AddWithValue("@total_notes", readout.noteData?.TotalNotes ?? 0);
                    command.Parameters.AddWithValue("@notes_hit", readout.noteData?.TotalNotesHit ?? 0);
                    command.Parameters.AddWithValue("@notes_missed", readout.noteData?.TotalNotesMissed ?? 0);
                    command.Parameters.AddWithValue("@highest_hit_streak", readout.noteData?.HighestHitStreak ?? 0);
                    command.Parameters.AddWithValue("@accuracy", Math.Round(readout.noteData?.Accuracy ?? 0.0, 1));
                    command.Parameters.AddWithValue("@completed", completed ? 1 : 0);
                    command.Parameters.AddWithValue("@paused", paused ? 1 : 0);

                    command.Parameters.AddWithValue("@total_perfect_hits", saData?.TotalPerfectHits ?? (object)DBNull.Value);
                    command.Parameters.AddWithValue("@perfect_phrases", saData?.PerfectPhrases ?? (object)DBNull.Value);
                    command.Parameters.AddWithValue("@good_phrases", saData?.GoodPhrases ?? (object)DBNull.Value);
                    command.Parameters.AddWithValue("@passed_phrases", saData?.PassedPhrases ?? (object)DBNull.Value);
                    command.Parameters.AddWithValue("@failed_phrases", saData?.FailedPhrases ?? (object)DBNull.Value);
                    command.Parameters.AddWithValue("@highest_perfect_phrase_streak", saData?.HighestPerfectPhraseStreak ?? (object)DBNull.Value);
                    command.Parameters.AddWithValue("@highest_good_phrase_streak", saData?.HighestGoodPhraseStreak ?? (object)DBNull.Value);
                    command.Parameters.AddWithValue("@highest_passed_phrase_streak", saData?.HighestPassedPhraseStreak ?? (object)DBNull.Value);
                    command.Parameters.AddWithValue("@highest_failed_phrase_streak", saData?.HighestFailedPhraseStreak ?? (object)DBNull.Value);
                    command.Parameters.AddWithValue("@current_score", saData?.CurrentScore ?? (object)DBNull.Value);
                    command.Parameters.AddWithValue("@highest_multiplier", saData?.HighestMultiplier ?? (object)DBNull.Value);

                    command.ExecuteNonQuery();
                }
            }
            catch (Exception ex)
            {
                Logger.LogError("Error logging to SQLite: {0}", ex.Message);
            }
        }

        private void LogToCsv(SongDetails song, RSMemoryReadout readout, bool completed, bool paused,
                               string resolvedArrangementID, string resolvedPath, string resolvedTuning)
        {
            try
            {
                // Recreate the header if the file was removed while running
                if (!File.Exists(csvPath))
                {
                    InitializeCsv();
                }

                // Null outside Score Attack, which leaves those columns empty
                ScoreAttackNoteData? saData = readout.mode == RSMode.SCOREATTACK && readout.noteData is ScoreAttackNoteData sa ? sa : null;

                StringBuilder line = new StringBuilder();

                line.Append($"\"{metadataTimestamp:yyyy-MM-dd HH:mm:ss}\",");
                line.Append($"\"{actualStartTimestamp:yyyy-MM-dd HH:mm:ss}\",");
                line.Append($"\"{actualEndTimestamp:yyyy-MM-dd HH:mm:ss}\",");
                line.Append($"\"{EscapeCsv(song.songID)}\",");
                line.Append($"\"{EscapeCsv(song.songName)}\",");
                line.Append($"\"{EscapeCsv(song.artistName)}\",");
                line.Append($"\"{EscapeCsv(song.albumName)}\",");
                line.Append($"{song.albumYear},");
                line.Append($"{song.songLength.ToString(CultureInfo.InvariantCulture)},");
                line.Append($"\"{EscapeCsv(resolvedArrangementID)}\",");
                line.Append($"\"{EscapeCsv(resolvedPath)}\",");
                line.Append($"\"{EscapeCsv(resolvedTuning)}\",");
                line.Append($"\"{readout.mode}\",");
                line.Append($"\"{EscapeCsv(song.toolkit?.author ?? "")}\",");
                line.Append($"{readout.noteData?.TotalNotes ?? 0},");
                line.Append($"{readout.noteData?.TotalNotesHit ?? 0},");
                line.Append($"{readout.noteData?.TotalNotesMissed ?? 0},");
                line.Append($"{readout.noteData?.HighestHitStreak ?? 0},");
                line.Append($"{Math.Round(readout.noteData?.Accuracy ?? 0.0, 1).ToString(CultureInfo.InvariantCulture)},");
                line.Append($"{(completed ? "True" : "False")},");
                line.Append($"{(paused ? "True" : "False")},");

                line.Append($"{saData?.TotalPerfectHits.ToString() ?? ""},");
                line.Append($"{saData?.PerfectPhrases.ToString() ?? ""},");
                line.Append($"{saData?.GoodPhrases.ToString() ?? ""},");
                line.Append($"{saData?.PassedPhrases.ToString() ?? ""},");
                line.Append($"{saData?.FailedPhrases.ToString() ?? ""},");
                line.Append($"{saData?.HighestPerfectPhraseStreak.ToString() ?? ""},");
                line.Append($"{saData?.HighestGoodPhraseStreak.ToString() ?? ""},");
                line.Append($"{saData?.HighestPassedPhraseStreak.ToString() ?? ""},");
                line.Append($"{saData?.HighestFailedPhraseStreak.ToString() ?? ""},");
                line.Append($"{saData?.CurrentScore.ToString() ?? ""},");
                line.Append($"{saData?.HighestMultiplier.ToString() ?? ""}");

                File.AppendAllText(csvPath, line.ToString() + Environment.NewLine);
            }
            catch (Exception ex)
            {
                Logger.LogError("Error logging to CSV: {0}", ex.Message);
            }
        }

        private string EscapeCsv(string value)
        {
            if (string.IsNullOrEmpty(value))
            {
                return "";
            }

            return value.Replace("\"", "\"\"");
        }

        public void Close()
        {
            if (sqliteConnection != null)
            {
                sqliteConnection.Close();
                sqliteConnection.Dispose();
            }
        }
    }
}
