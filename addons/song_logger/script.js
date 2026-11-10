//Remember previous song
var prevSongID = "";

//Listen to onSongStarted
var poller = new SnifferPoller({
	onSongStarted: function(song) {
		if(song.songID == prevSongID) {
			return;
		}

		var song = song.artistName + " - " + song.songName;
		$("div.log").append("<div class='log_line'>"+song+"</div><br>");

		prevSongID = song.songID;
	}
});