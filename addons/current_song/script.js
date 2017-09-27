//If you want to preview what the popup looks like, set this to true
var preview = false;

//JQuerys document.onReady function
//Gets called after the webpage is loaded
$(function() {
	//If preview is enabled, show the popup with some example text
	if(preview) {
		$("h1.artist_name").text("Artist name");
		$("h1.song_name").text("Song name");
		$("h1.album_name").text("Album name (1234)");
		$("img.album_cover").attr("src", "rs_pick.png");
		showPopup();
	}
	else {
		//Set a timer to refresh our data every 1000 milliseconds
		setInterval(refresh, 1000);
	}
});

//Remember popup visibility
var visible = false;

function refresh() {
	//JSON query the addon service
	$.getJSON("http://localhost:9938", function(data) {
		//If data was successfully gotten
		if(data.success) {
			//Get song details out of it
			var details = data.songDetails;

			//If song details are invalid, hide popup
			if(details.songLength == 0 && details.albumYear == 0 && details.numArrangements == 0) {
				hidePopup();
				return;
			}

			//Transfer data onto DOM elements using JQuery selectors
			$("h1.artist_name").text(details.artistName);
			$("h1.song_name").text(details.songName);
			$("h1.album_name").text(details.albumName + " (" + details.albumYear + ")");

			//Set the album art, which is base64 encoded, HTML can handle that, just append
			//"data:image/jpeg; base64, " in front to tell HTML how to use the data
			if(data.albumCoverBase64 != null) {
				$("img.album_cover").attr("src", "data:image/jpeg;base64, " + data.albumCoverBase64);
			}

			//If the song timer is over 1 second, we are playing a song, so show the popup
			if(data.memoryReadout.songTimer > 1) {
				showPopup();
			}else if(data.memoryReadout.songTimer <= 1) { //Else if the song timer is less than a second, we probably aren't playing anything
				hidePopup();
			}
		}else { //If the data getting was not successful, hide the popup
			hidePopup();
		}
	}, "json");
}

//Hides the popup if it is visible
function hidePopup() {
	if(!visible) return;

	//Do a fadeout over 1000 milliseconds and set the visible variable to false
	$("div.popup").fadeOut(1000);
	visible = false;
}

//Shows the popup if it is hidden
function showPopup() {
	if(visible) return;

	//Do a fadein over 1000 milliseconds and set the visible variable to true
	$("div.popup").fadeIn(1000);
	visible = true;
}