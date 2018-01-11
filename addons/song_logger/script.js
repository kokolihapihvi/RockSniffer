//JQuerys document.onReady function
//Gets called after the webpage is loaded
$(function() {
	//Set a timer to refresh our data every 1000 milliseconds
	setInterval(refresh, 1000);
});

//Remember previous song name
var prevSong = "";

function refresh() {
	//JSON query the addon service
	$.getJSON("http://localhost:9938", function(data) {
		//If data was successfully gotten
		if(data.success) {
			//Get song details out of it
			var details = data.songDetails;

			//If song details are invalid, ignore
			if(details.songLength == 0 && details.albumYear == 0 && details.numArrangements == 0) {
				return;
			}

			var song = details.artistName + " - " + details.songName;

			//If the song timer is over 1 second, we are playing a song, so add it to the log
			if(data.memoryReadout.songTimer > 1) {
				//If current song differs from previous song
				if(prevSong != song) {
					//Add a line to the log
					$("div.log").append("<div class='log_line'>"+song+"</div><br>");

					//Remember previous song
					prevSong = song;
				}				
			}
		}
	});
}