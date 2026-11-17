//Remember previous song
let prevSongID = "";

//Listen to onSongStarted
const poller = new SnifferPoller({
	onSongStarted: function(song) {
		if(song.songID == prevSongID) {
			return;
		}

		const songText = song.artistName + " - " + song.songName;
		$("div.log").append("<div class='log_line'>"+songText+"</div><br>");

		prevSongID = song.songID;
	}
});