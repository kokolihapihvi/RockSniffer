var widthUI = document.getElementsByClassName("mainContainer")[0].offsetWidth;
var defaultPath = "Bass";
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
function accuracyGradient(accuracy){
	if (accuracy == "Rest"){return "grey"}
	if (accuracy < 50){return "rgb(255, 0, 0)"}
	var red = Math.min(((100 - accuracy)/25),1) * 255;
	var green = Math.min(((accuracy - 50)/25),1) * 255;
	return "rgb("+red+","+green+", 0)";
};

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

var tracker = new PlaythroughTracker(poller);

var app = new Vue({
	el: "#app",
	data: {
		visible: true,
		mode: 0,
		prevData: {},
		snifferData: {},
		feedback: [],
		feedbackIdx: 0,
        songInfoTransform: "translateX(0px)"
	},
    mounted: function() {
        setInterval(this.doScrollSong, 4000);
    },
	methods: {
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
		cycleFeedback: function() {
			if(this.mode == 1) {
				setTimeout(() => this.cycleFeedback(), 5000);
				this.feedbackIdx = (this.feedbackIdx+1) % this.feedback.length;
			}
		},
		hasPreviousBest: function() {
			return tracker.hasPreviousBest();
		},
		trackerScore: function() {
			return tracker.getFinal();
		}
	},
	computed: {
		song: function() {
			if(!this.snifferData) {
				return null;
			}

			return this.snifferData.songDetails;
		},	
		readout: function() {
			if(!this.snifferData) {
				return null;
			}

			return this.snifferData.memoryReadout;
		},
		notes: function() {
			if(!this.snifferData) {
				return null;
			}

			return this.readout.noteData;
		},
		songLength: function() {
			return formatTimer(this.song.songLength);
		},
		songTimer: function() {
			return formatTimer(this.readout.songTimer);
		},
		songProgress: function() {
			if (this.readout.songTimer == 0){return 0;}
			return (this.readout.songTimer / this.song.songLength) * 100;
		},
		phraseStartTime: function() {
			if (this.readout.songTimer == 0){return 0;}
			var currentPhrase = poller.getCurrentPhrase();
			if(currentPhrase.index == 0){return 0;}
			return (currentPhrase.startTime / this.song.songLength) * 100;
		},
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
		arrangement: function() {
			if(this.song == null) {return null;}
			if(this.song.arrangements == null) {return null;}
			
			for (var i = this.song.arrangements.length - 1; i >= 0; i--) {
				var arrangement = this.song.arrangements[i];

				if(arrangement.arrangementID.length == 32 && arrangement.arrangementID == this.readout.arrangementID) {
					return arrangement;
				}
			}
			
			for (var i = this.song.arrangements.length - 1; i >= 0; i--) {
				var arrangement = this.song.arrangements[i];
				
				//rearrange for readability- default should be the else statement
				if(this.prevPath == null && arrangement.name == defaultPath && arrangement.type == defaultPath && arrangement.isBonusArrangement == false && arrangement.isAlternateArrangement == false){
					return arrangement;
				} else if (arrangement.name == this.prevPath && arrangement.type == this.prevPath && arrangement.isBonusArrangement == false && arrangement.isAlternateArrangement == false){
					return arrangement;
					
				}				
			}	
			return null;
		},
        tuningName: function() {
            if(this.arrangement == null) {return null;}
			return this.arrangement.tuning.TuningName;		
        },
		sections: function() {
			var arrangement = this.arrangement;

			if(arrangement == null) {return null;}			
			
			var sections = arrangement.sections;

			var songLength = this.song.songLength;
			
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
				
				if(this.readout.songTimer > section.startTime & this.readout.songTimer <= section.endTime){
					section.style.backgroundColor = "royalblue";
				}
				
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
		phraseIterations: function() {
			var arrangement = this.arrangement;

			if(arrangement == null) {return null;}			
			
			var phraseIterations = arrangement.phraseIterations;

			var songLength = this.song.songLength;
					
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
					height: Math.round((phraseHeight)*100)+'%'
				}

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
		prevSong: function() {
			return this.prevData.songDetails;
		},
		prevReadout: function() {
			if(!this.prevData) {
				return null;
			}

			return this.prevData.memoryReadout;
		},
		prevNotes: function() {
			if(!this.snifferData) {
				return null;
			}

			return this.prevReadout.noteData;
		},
		
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
		
		prevPath: function() {
			if(this.prevSong == null){return null;}
			return this.prevArrangement.type;
		},
		
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

function formatTimer(time) {
	var minutes = Math.floor(time/60);
	var seconds = time % 60;

	if(time < 0) {
		return "";
	}

	return [minutes,seconds].map(X => ('0' + Math.floor(X)).slice(-2)).join(':')
}

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