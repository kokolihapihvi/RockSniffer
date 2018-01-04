//If you want to preview what the popup looks like, set this to true
var preview = false;

//Enable animation (percentage scrolls to the next number instead of snapping)
var animate_percentage = true;

//Enable colour animation (percentage fades from one color to another across 0%->100%)
var animate_percentage_color = true;

//Color for 0%
var color_0 = "#FF0000";

//Color for 50%
var color_50 = "#FFFF00";

//Color for 100%
var color_100 = "#00FF00";

//The point at which the 50% color is placed in the gradient, number between 0 and 1
var color_midpoint = 0.8;

//Exponent for interpolation, higher number = steeper curve towards the end, 1 = linear interpolation
var color_exponent = 2;

//JQuerys document.onReady function
//Gets called after the webpage is loaded
$(function() {
	//If preview is enabled, show the popup with some example text
	if(preview) {
		$("h1.artist_name").text("Artist name");
		$("h1.song_name").text("Song name");
		$("h1.album_name").text("Album name (1234)");
		$("h1.accuracy_percentage").text("100%");
		$("img.album_cover").attr("src", "rs_pick.png");
		showPopup();

		if(animate_percentage) {
			testAnim = function() {
				$("h1.accuracy_percentage").prop("number", 0).finish().animateNumber({
						number: 100,
						numberStep: function(now, tween) {
							$(tween.elem).text(now.toFixed(2)+"%");

							if(animate_percentage_color) {
								$(tween.elem).css("color", lerpColors(now/100));
							}
						}
					}, 5000);
			};

			testAnim();

			setInterval(testAnim, 6000);
		}
	}
	else {
		//Set a timer to refresh our data every 1000 milliseconds
		setInterval(refresh, 1000);
	}
});

//Remember popup visibility
var visible = false;

//Remember previous percentage for the animation
var prev_accuracy = 0;

function refresh() {
	//JSON query the addon service
	$.getJSON("http://localhost:9938", function(data) {
		//If data was successfully gotten
		if(data.success) {
			//Get song details out of it
			var details = data.songDetails;

			//Get memory readout
			var readout = data.memoryReadout;

			//If song details are invalid, hide popup
			if(details.songLength == 0 && details.albumYear == 0 && details.numArrangements == 0) {
				hidePopup();
				return;
			}

			//Transfer data onto DOM elements using JQuery selectors
			$("h1.artist_name").text(details.artistName);
			$("h1.song_name").text(details.songName);
			$("h1.album_name").text(details.albumName + " (" + details.albumYear + ")");

			//Calculate percentage (notes hit / notes hit + notes missed)
			var accuracy = readout.totalNotesHit / (readout.totalNotesHit + readout.totalNotesMissed);
			accuracy *= 100;

			//If the accuracy is not a number, set it to 0
			if(isNaN(accuracy)) {
				accuracy = 0;
			}

			if(animate_percentage) {
				//Format it and apply it to the element
				$("h1.accuracy_percentage").prop("number", prev_accuracy).finish().animateNumber({
					number: accuracy,
					numberStep: function(now, tween) {
						$(tween.elem).text(now.toFixed(2)+"%");

						if(animate_percentage_color) {
							$(tween.elem).css("color", lerpColors(now/100));
						}
					}
				}, 1000);

				//Remember previous accuracy
				prev_accuracy = accuracy;
			} else {
				$("h1.accuracy_percentage").text(accuracy.toFixed(2)+"%");
			}


			//Set the album art, which is base64 encoded, HTML can handle that, just append
			//"data:image/jpeg; base64, " in front to tell HTML how to use the data
			if(data.albumCoverBase64 != null) {
				$("img.album_cover").attr("src", "data:image/jpeg;base64, " + data.albumCoverBase64);
			}

			//If the song timer is over 1 second, we are playing a song, so show the popup
			if(readout.songTimer > 1) {
				showPopup();
			}else if(readout.songTimer <= 1) { //Else if the song timer is less than a second, we probably aren't playing anything
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

//Lerp between the 0%, 50% and 100% colors
function lerpColors(p) {
	//Transform to logarithmic scale
	p = Math.pow(p, color_exponent)

	if(p <= color_midpoint) {
		return lerpColor(color_0, color_50, p / color_midpoint);
	} else {
		return lerpColor(color_50, color_100, (p - color_midpoint) / (1 - color_midpoint));
	}
}

/** https://gist.github.com/rosszurowski/67f04465c424a9bc0dae
 * A linear interpolator for hexadecimal colors
 * @param {String} a
 * @param {String} b
 * @param {Number} amount
 * @example
 * // returns #7F7F7F
 * lerpColor('#000000', '#ffffff', 0.5)
 * @returns {String}
 */
function lerpColor(a, b, amount) { 
	//Clamp the amount to 0-1 range
	amount = Math.min(1, Math.max(0,amount));

    var ah = parseInt(a.replace(/#/g, ''), 16),
        ar = ah >> 16, ag = ah >> 8 & 0xff, ab = ah & 0xff,
        bh = parseInt(b.replace(/#/g, ''), 16),
        br = bh >> 16, bg = bh >> 8 & 0xff, bb = bh & 0xff,
        rr = ar + amount * (br - ar),
        rg = ag + amount * (bg - ag),
        rb = ab + amount * (bb - ab);

    return '#' + ((1 << 24) + (rr << 16) + (rg << 8) + rb | 0).toString(16).slice(1);
}