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
    /// Handles playthrough history logging to SQL and CSV
    /// Uses EXACT timestamps from Sniffer.cs Logger.Log calls
    /// Supports Score Attack mode with additional stats
    /// </summary>
    public class PlaythroughHistory
    {
        private readonly string sqlitePath;
        private readonly string csvPath;
        private bool sqliteEnabled;
        private bool csvEnabled;

        private SQLiteConnection sqliteConnection;
        private DateTime metadataTimestamp;      // When metadata loaded (OnSongStarted)
        private DateTime actualStartTimestamp;    // When song ACTUALLY started (Logger.Log EVENT=START)
        private DateTime actualEndTimestamp;      // When song ACTUALLY ended (Logger.Log EVENT=END)
        private RSMemoryReadout startReadout;
        private string arrangementPath;          // Arrangement type (Lead/Rhythm/Bass)
        private string arrangementTuning;        // Tuning (e.g., "E Standard", "D Standard (Capo Fret 2)")

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
                    // Create CSV with headers including Score Attack fields
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

        /// <summary>
        /// Called when song metadata is loaded (OnSongStarted event)
        /// </summary>
        public void OnMetadataLoaded(SongDetails song, RSMemoryReadout readout)
        {
            metadataTimestamp = DateTime.Now;
            startReadout = readout?.Clone();
        }

        /// <summary>
        /// Called when Sniffer.cs logs EVENT=START - this is the ACTUAL song start
        /// </summary>
        public void OnActualSongStart(RockSnifferLib.Events.OnActualSongStartArgs e)
        {
            actualStartTimestamp = e.timestamp;
            arrangementPath = e.path ?? "";
            arrangementTuning = e.tuning ?? "";
            // arrangementID is also available on e (e.arrangementID) but Program.cs
            // doesn't propagate it as a field here; the end-of-song event carries the
            // run-context arrangementID directly via e.arrangementID at OnActualSongEnd.
        }

        /// <summary>
        /// Called when Sniffer.cs fires OnActualSongEnd. The args carry the arrangement
        /// context captured at song start (preserved even if currentMemoryReadout has
        /// advanced to a later song), keeping arrangement columns correct in Nonstop Play.
        /// </summary>
        public void OnActualSongEnd(RockSnifferLib.Events.OnActualSongEndArgs e)
        {
            if (e == null || e.song == null || !e.song.IsValid())
            {
                return;
            }

            // Skip history writes (CSV and SQLite) for Multiplayer plays - multi-user note
            // data isn't tracked, so rows would carry wrong single-user values.
            // wasMultiplayerMode is captured at song start in Sniffer.cs. EVENT=END logging,
            // Discord RPC, and live overlays are unaffected.
            if (e.wasMultiplayerMode)
            {
                return;
            }

            // e.wasNonstopMode remains populated on the event args for downstream
            // consumers; it no longer gates history writes.

            // Prefer the snapshot readout captured inside Sniffer.LogSongEnd (so we get
            // accurate end-of-song noteData / mode even if currentMemoryReadout has since
            // been updated). Fall back to a defensive empty readout if the snapshot is
            // somehow null.
            var readout = e.readout ?? new RSMemoryReadout();
            var song = e.song;
            bool completed = e.completed;
            bool paused = e.paused;

            // Resolve arrangement metadata, preferring the run-context values from the
            // event args (captured at song start in Sniffer.cs). Fall back to the
            // OnActualSongStart-set fields if the args don't have them, and finally to the
            // readout's arrangementID. This layered approach keeps the path/tuning correct
            // for Nonstop and recovers gracefully for any edge case where the args are
            // missing values.
            string resolvedArrangementID = !string.IsNullOrEmpty(e.arrangementID)
                ? e.arrangementID
                : (readout.arrangementID ?? "");
            string resolvedPath = !string.IsNullOrEmpty(e.path)
                ? e.path
                : (arrangementPath ?? "");
            string resolvedTuning = !string.IsNullOrEmpty(e.tuning)
                ? e.tuning
                : (arrangementTuning ?? "");

            actualEndTimestamp = e.timestamp;

            if (sqliteEnabled)
            {
                LogToSqlite(song, readout, completed, paused,
                            resolvedArrangementID, resolvedPath, resolvedTuning);
            }

            if (csvEnabled)
            {
                LogToCsv(song, readout, completed, paused,
                         resolvedArrangementID, resolvedPath, resolvedTuning);
            }
        }

        private void LogToSqlite(SongDetails song, RSMemoryReadout readout, bool completed, bool paused,
                                  string resolvedArrangementID, string resolvedPath, string resolvedTuning)
        {
            try
            {
                // Check if this is Score Attack mode
                bool isScoreAttack = readout.mode == RSMode.SCOREATTACK;
                ScoreAttackNoteData? saData = null;

                if (isScoreAttack && readout.noteData is ScoreAttackNoteData scoreAttackData)
                {
                    saData = scoreAttackData;
                }

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
                    // Standard fields
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

                    // Score Attack specific fields (NULL if not Score Attack mode)
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
                // Self-heal: if the CSV vanished mid-session (deleted, moved,
                // rotated), recreate it with headers before appending - otherwise
                // AppendAllText silently rebuilds a headerless file, since
                // InitializeCsv only runs at startup.
                if (!File.Exists(csvPath))
                {
                    InitializeCsv();
                }

                // Check if this is Score Attack mode
                bool isScoreAttack = readout.mode == RSMode.SCOREATTACK;
                ScoreAttackNoteData? saData = null;

                if (isScoreAttack && readout.noteData is ScoreAttackNoteData scoreAttackData)
                {
                    saData = scoreAttackData;
                }

                StringBuilder line = new StringBuilder();

                // Standard fields
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

                // Score Attack specific fields (empty if not Score Attack)
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
