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
FONT SIZES
___________
The various font sizes can be edited in style.css. Search for font-size; the 'div' it belongs to (e.g. songName or artistName) should be self-explanatory


___________

CUSTOM FONT
___________
To use a custom font, place the font file in this directory, and edit the following lines in style.css:

@font-face {
  font-family: PixelFont;
  src: url(ARCADE_N.ttf);
  }
  
Replace 'ARCADE_N.tff' with your chosen font.



___________
CUSTOM COLORS
___________
This is a bit more advanced. The colors of the main UI elements can be edited via style.css. They are stored in various 'a' classes and 'div' classes as RGB values (#000000)

___________
DISABLE ALBUM ART
___________

If you would like to disable the Album art, replace line 23 in Arcade.html

<img class="albumArt" v-bind:src="'data:image/jpeg;base64,'+song.albumArt">

with 

<! -- <img class="albumArt" v-bind:src="'data:image/jpeg;base64,'+song.albumArt"> -->

To re-enable, simply delete the <! --  &  --> at the beginning and end of the 