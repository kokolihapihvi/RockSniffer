Thanks for choosing PoizenJam's Arcade UI! I hope you enjoy!

NOTES

___________
UI SIZE
___________

The size of the UI can be adjusted in the file 'style.css'. Simply edit:

div.popup {
	width: 420px;
	display: flex;
	overflow: hidden;
	background-color: rgba(0,0,0,1);
	color: white;
	padding: 0px 0px 0px 0px;
}

div.mainContainer {
	width: 420px;
}


and replace '420px' with whatever size you need the UI to be. 


___________
DISABLE ALBUM ART
___________

If you would like to disable the Album art, replace line 24 in current_song_v3.1.html

<img class="albumArt" v-bind:src="'data:image/jpeg;base64,'+song.albumArt">

with 

<! -- <img class="albumArt" v-bind:src="'data:image/jpeg;base64,'+song.albumArt"> -->

To re-enable, simply delete the <! --  &  --> at the beginning and end of the 