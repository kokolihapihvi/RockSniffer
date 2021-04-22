var widthUI = document.getElementsByClassName("mainContainer")[0].offsetWidth; //Get width of UI

//create dictionary for translating phrase grades into color 
var gradeCode = {
	NaN : 'white',
	'error' : 'white',
	'No Data' : 'grey',
	'Rest' : 'black',
	'Fail' : 'red',
	'Pass' : 'indigo',
	'Good' : 'gold',
	'Perfect' : 'lime'
}

//Create function for translating phrase accuracy into color
function accuracyGradient(accuracy){
	if (accuracy == "Rest"){return "grey"}
	if (accuracy < 50){return "rgb(255, 0, 0)"}
	var red = Math.min(((100 - accuracy)/25),1) * 255;
	var green = Math.min(((accuracy - 50)/25),1) * 255;
	return "rgb("+red+","+green+", 0)";
};

//Edit poller functions
var poller = new SnifferPoller({
	interval: 100,

	onData: function(data) {
		app.snifferData = data;
	},
	
	onSongStarted: function(data) {
		app.mode = 0;
		app.visible = true;
	},
	
	onSongChanged: function(data) {
		app.mode = 0
		app.visible = true;
	},
	
	onSongEnded: function(data) {
		app.prevData = app.snifferData;
		app.mode = 1;
		generateFeedback();
	}
});

//Get tracker functions
var tracker = new PlaythroughTracker(poller);


//Create app
var app = new Vue({
	el: "#app",
	//create variable for data storage
	data: {
		visible: true,
		mode: 0,
		prevData: {},
		snifferData: {},
		feedback: [],
		feedbackIdx: 0,
        songInfoTransform: "translateX(0px)"
	},
	
	//set interval for song scroll
    mounted: function() {
        setInterval(this.doScrollSong, 4000);
    },
	
	//Create functions for UI
	methods: {
		
		//Scroll song if larger than UI
        doScrollSong: function() {
			if(this.song == null){
				var width = 0;
				} else {				
				var width = (document.getElementsByClassName("songName")[0].offsetWidth + document.getElementsByClassName("songDash")[0].offsetWidth + document.getElementsByClassName("artistName")[0].offsetWidth);
				}
            if(this.songInfoTransform == "translateX(0px)" && width > widthUI) {
                this.songInfoTransform = "translateX(-"+(width-widthUI)+"px)";
            } else {
                this.songInfoTransform = "translateX(0px)";
            }
        },
		
		//If multiple feedback, cycle
		cycleFeedback: function() {
			if(this.mode == 1) {
				setTimeout(() => this.cycleFeedback(), 5000);
				this.feedbackIdx = (this.feedbackIdx+1) % this.feedback.length;
			}
		},
		
		//return previous best if available
		hasPreviousBest: function() {
			return tracker.hasPreviousBest();
		},
		
		//Return trackerScore
		trackerScore: function() {
			return tracker.getFinal();
		}
	},
	
	//Grab variables for UI
	computed: {
		
		//Get song details
		song: function() {
			if(!this.snifferData) {
				return null;
			}

			return this.snifferData.songDetails;
		},	
		
		//Get current readout
		readout: function() {
			if(!this.snifferData) {
				return null;
			}

			return this.snifferData.memoryReadout;
		},
		
		//Get note data
		notes: function() {
			if(!this.snifferData) {
				return null;
			}

			return this.readout.noteData;
		},
		
		//Get song length
		songLength: function() {
			return formatTimer(this.song.songLength);
		},
		
		//Get song timer
		songTimer: function() {
			return formatTimer(this.readout.songTimer);
		},
		
		//Get song Progress in %
		songProgress: function() {
			if (this.readout.songTimer == 0){return 0;}
			return (this.readout.songTimer / this.song.songLength) * 100;
		},
		
		//get Phrase Start Time
		phraseStartTime: function() {
			if (this.readout.songTimer == 0){return 0;}
			var currentPhrase = poller.getCurrentPhrase();
			if(currentPhrase.index == 0){return 0;}
			return (currentPhrase.startTime / this.song.songLength) * 100;
		},
		
		//Calculate phrase height from difficulty
		phraseHeight: function() {
			if (this.readout.songTimer == 0){return 0;}
			var phraseHeight = 1;
			var maxDif = poller.getMaxDif();
			var phrase = poller.getCurrentPhrase();
			if(maxDif != 0){
				phraseHeight = phrase.maxDifficulty/maxDif;
			}
			return phraseHeight*100;
		},		
		
		//Get current arrangement
		arrangement: function() {
			if(this.song == null) {return null;}
			if(this.song.arrangements == null) {return null;}
			
			//Cycle through list of arrangemwnts for matching ID
			for (var i = this.song.arrangements.length - 1; i >= 0; i--) {
				var arrangement = this.song.arrangements[i];

				if(arrangement.arrangementID.length == 32 && arrangement.arrangementID == this.readout.arrangementID) {
					return arrangement;
				}
			}
			
			//If no ID found, vall back on previous Path first then defaultPath
			for (var i = this.song.arrangements.length - 1; i >= 0; i--) {
				var arrangement = this.song.arrangements[i];
				if(this.prevPath == null && arrangement.name == defaultPath && arrangement.type == defaultPath && arrangement.isBonusArrangement == false && arrangement.isAlternateArrangement == false){
					return arrangement;
				} else if (arrangement.name == this.prevPath && arrangement.type == this.prevPath && arrangement.isBonusArrangement == false && arrangement.isAlternateArrangement == false){
					return arrangement;
					
				}				
			}	
			return null;
		},
		
		//Get tuning name
        tuningName: function() {
            if(this.arrangement == null) {return null;}
			return this.arrangement.tuning.TuningName;		
        },
		
		//Create and draw sections
		sections: function() {
			var arrangement = this.arrangement;

			if(arrangement == null) {return null;}			
			
			var sections = arrangement.sections;

			var songLength = this.song.songLength;
			
			//Cycle through all sections and draw
			for (var i = 0; i < sections.length; i++) {
				var section = sections[i];

				section.length = section.endTime - section.startTime;

				section.startPercent = (section.startTime / songLength) * 100;
				
				//Always make the first section start from 0%
				if(i == 0) {
					section.length =  section.endTime;
					section.startPercent = 0;
				}

				section.endPercent = (section.endTime / songLength) * 100;

				section.lengthPercent = (section.length / songLength) * 100;

				section.style = {
					left: section.startPercent+'%',
					width: (section.lengthPercent-(100/(widthUI)))+'%',
				}
				
				//If currently playing, color royal-blue as in game
				if(this.readout.songTimer > section.startTime & this.readout.songTimer <= section.endTime){
					section.style.backgroundColor = "royalblue";
				}
				
				//If has previous best, color based on that. If not, then color using accuracy gradient
				if (this.readout.songTimer > section.endTime | this.readout.gameStage == "panel_bib" | this.readout.gameStage == "sa_songreview" | this.readout.gameStage == "las_songreview"){
					if(tracker.hasPreviousBest() & tracker.getSectionAccuracy((section.startTime + section.endTime)/2) != 'Rest') {
						section.style.backgroundColor = (tracker.isBetterRelative((section.startTime + section.endTime)/2) ? "lime" : "red");
					} else {						
						section.style.backgroundColor = accuracyGradient(tracker.getSectionAccuracy((section.startTime + section.endTime)/2));
					}
				}

				sections[i] = section;
			}

			return sections;
		},
		
		//Create and draw phrase iterations
		phraseIterations: function() {
			var arrangement = this.arrangement;

			if(arrangement == null) {return null;}			
			
			var phraseIterations = arrangement.phraseIterations;

			var songLength = this.song.songLength;
					
			var maxDif = poller.getMaxDif();		
			
			//Cycle through phrases and draw
			for (var i = 0; i < phraseIterations.length; i++) {
				var phrase = phraseIterations[i];

				phrase.length = phrase.endTime - phrase.startTime;

				phrase.startPercent = (phrase.startTime / songLength) * 100;
				
				//Always make the first phrase start from 0%
				if(i == 0) {
					phrase.length =  phrase.endTime;
					phrase.startPercent = 0;
				}

				phrase.endPercent = (phrase.endTime / songLength) * 100;

				phrase.lengthPercent = (phrase.length / songLength) * 100;
				
				var phraseHeight = 1;
				
				//If has maxDifficulty, set phrase height to fraction of maxDif. Else set to max height
				if(maxDif != 0){
					phraseHeight = phrase.maxDifficulty/maxDif;
				}
				
				phrase.style = {
					left: phrase.startPercent+'%',
					width: (phrase.lengthPercent-(100/(widthUI)))+'%',
					height: Math.round((phraseHeight)*100)+'%'
				}

				//If phrase grade exists, color based on that; else, use accuracy gradient
				if (this.readout.songTimer > phrase.endTime | this.readout.gameStage == "panel_bib" | this.readout.gameStage == "sa_songreview"  | this.readout.gameStage == "las_songreview"){
					if(tracker.getPhraseGrade((phrase.startTime + phrase.endTime)/2) != "No Data"){
						phrase.style.backgroundColor = gradeCode[tracker.getPhraseGrade((phrase.startTime + phrase.endTime)/2)];
					} else {
						phrase.style.backgroundColor = accuracyGradient(tracker.getPhraseAccuracy((phrase.startTime + phrase.endTime)/2));						
					}
				}
				phraseIterations[i] = phrase;
			}
			return phraseIterations;
		},
		/* PREV */
		
		//Get previous song
		prevSong: function() {
			return this.prevData.songDetails;
		},
		
		//Get previous readout
		prevReadout: function() {
			if(!this.prevData) {
				return null;
			}

			return this.prevData.memoryReadout;
		},
		
		//Get previous note data 
		prevNotes: function() {
			if(!this.snifferData) {
				return null;
			}

			return this.prevReadout.noteData;
		},
		
		//Get previous arrangement
		prevArrangement: function() {
			if(this.prevSong == null) {return null;}
			if(this.prevSong.arrangements == null) {return null;}
			
			for (var i = this.prevSong.arrangements.length - 1; i >= 0; i--) {
				var arrangement = this.prevSong.arrangements[i];

				if(arrangement.arrangementID.length == 32 && arrangement.arrangementID == this.prevReadout.arrangementID) {
					return arrangement;
				}
			}
			return null;
		},
		
		//Get previous path info
		prevPath: function() {
			if(this.prevSong == null){return null;}
			return this.prevArrangement.type;
		},
		
		//Get previous sections and draw results screen
		prevSections: function() {
			var arrangement = this.prevArrangement;

			if(arrangement == null) {return null;}

			var sections = arrangement.sections;

			var songLength = this.prevSong.songLength;

			for (var i = 0; i < sections.length; i++) {
				var section = sections[i];

				section.length = section.endTime - section.startTime;

				section.startPercent = (section.startTime / songLength) * 100;
				
				//Always make the first section start from 0%
				if(i == 0) {
					section.length =  section.endTime;
					section.startPercent = 0;
				}

				section.endPercent = (section.endTime / songLength) * 100;

				section.lengthPercent = (section.length / songLength) * 100;

				section.style = {
					left: section.startPercent+'%',
					width: (section.lengthPercent-(100/(widthUI)))+'%'
				}
				
				if(tracker.hasPreviousBest()) {
					section.style.backgroundColor = (tracker.isBetterRelative((section.startTime + section.endTime)/2) ? "lime" : "red");
				} else {						
					section.style.backgroundColor = accuracyGradient(tracker.getSectionAccuracy((section.startTime + section.endTime)/2));
				}
				
				sections[i] = section;
			}

			return sections;
		},
				
		//Get previous phrases and draw results screen
		prevPhrases: function() {
			var arrangement = this.prevArrangement;

			if(arrangement == null) {return null;}

			var phraseIterations = arrangement.phraseIterations;

			var songLength = this.prevSong.songLength;
			
			var maxDif = poller.getMaxDif();		
			
			for (var i = 0; i < phraseIterations.length; i++) {
				var phrase = phraseIterations[i];

				phrase.length = phrase.endTime - phrase.startTime;

				phrase.startPercent = (phrase.startTime / songLength) * 100;
				
				//Always make the first phrase start from 0%
				if(i == 0) {
					phrase.length =  phrase.endTime;
					phrase.startPercent = 0;
				}

				phrase.endPercent = (phrase.endTime / songLength) * 100;

				phrase.lengthPercent = (phrase.length / songLength) * 100;
				
				var phraseHeight = 1;
				
				if(maxDif != 0){
					phraseHeight = phrase.maxDifficulty/maxDif;
				}
				
				phrase.style = {
					left: phrase.startPercent+'%',
					width: (phrase.lengthPercent-(100/(widthUI)))+'%',
					height: Math.round(12*(phraseHeight))+'px'
				}
				
				if(tracker.getPhraseGrade((phrase.startTime + phrase.endTime)/2) != "No Data"){
					phrase.style.backgroundColor = gradeCode[tracker.getPhraseGrade((phrase.startTime + phrase.endTime)/2)];
				} else {
					phrase.style.backgroundColor = accuracyGradient(tracker.getPhraseAccuracy((phrase.startTime + phrase.endTime)/2));						
				}

				phraseIterations[i] = phrase;
			}

			return phraseIterations;
		}
	}
});

//Format timer
function formatTimer(time) {
	var minutes = Math.floor(time/60);
	var seconds = time % 60;

	if(time < 0) {
		return "";
	}

	return [minutes,seconds].map(X => ('0' + Math.floor(X)).slice(-2)).join(':')
}

//Generate feedback
function generateFeedback() {
	app.feedback = [];

	var arrangement = poller.getCurrentArrangement();
	var sections = arrangement.sections;
	var feedback = []

	var greens = 0;

	for (var i = sections.length - 1; i >= 0; i--) {
		var section = sections[i];
		var rel = tracker.getRelative(section.endTime);

		if(rel == null) {
			continue;
		}

		if(rel.Accuracy >= 0) {
			greens++;
		}

		if(rel.Accuracy >= 1) {
			feedback.push(rel.Accuracy.toFixed(1)+"% better accuracy in "+section.name);
		}
		if(rel.TotalNotesHit > 2) {
			feedback.push("Hit "+rel.TotalNotesHit+" more notes in "+section.name);
		}
	}

	if(greens > 0) {
		feedback.push(greens+" green sections");
	}

	feedback.sort(() => Math.random() - 0.5);

	if(poller.getCurrentAccuracy() == 100) {
		feedback.push("GOT A FULL COMPLETE!");
	}

	if(feedback.length == 0) {
		feedback.push("YOU TRIED!");
	}

	app.feedback = feedback;

	app.cycleFeedback();

	hideTimeout = setTimeout(() => {if(app.mode == 1) {app.mode = 0; app.visible = false;}}, 60000);
}
