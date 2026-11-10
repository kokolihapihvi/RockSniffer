const widthUI = document.getElementsByClassName("mainContainer")[0].offsetWidth; //Get width of UI

//create dictionary for translating phrase grades into color 
const gradeCode = {
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
	const red = Math.min(((100 - accuracy)/25),1) * 255;
	const green = Math.min(((accuracy - 50)/25),1) * 255;
	return "rgb("+red+","+green+", 0)";
};


//Edit poller functions
const poller = new SnifferPoller({
	interval: 100,

	onData: function(data) {
		app.snifferData = data;
	},



	onSongEnded: function(data) {
		app.prevData = app.snifferData;
		// Finalize the last section, then snapshot tracker outputs, BEFORE
		// generateFeedback and before the tracker's own callbacks run: tracker.onSongEnded
		// fires after this handler, so an unfinalized last section would make getFinal()
		// read 0, and the tracker's onSongChanged reset wipes the data on NSP songID
		// flips. finalize() is idempotent; the tracker's own later call no-ops.
		if (tracker.currentAttempt) {
			tracker.currentAttempt.finalize(poller.getCurrentReadout());
		}
		app.snapshotHasPreviousBest = tracker.hasPreviousBest();
		app.snapshotFinal = tracker.getFinal();
		app.mode = 1;
		poller.resultsHold.markShown();
		generateFeedback();
	},

});

//Get tracker functions
const tracker = new PlaythroughTracker(poller);


//Create app
const app = new Vue({
	el: "#app",
	//create variable for data storage
	data: {
		visible: true,
		mode: 0,
		prevData: {},
		snifferData: {},
		feedback: [],
		feedbackIdx: 0,
		// Snapshots of tracker outputs taken at onSongEnded. The tracker resets on the
		// NSP songID flip while mode 1 is still held; hasPreviousBest()/trackerScore()
		// read these snapshots during mode 1 so the comparison stays visible for the
		// full hold window.
		snapshotHasPreviousBest: null,
		snapshotFinal: null,
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
				let width = 0;
				} else {				
				width = (document.getElementsByClassName("songName")[0].offsetWidth + document.getElementsByClassName("songDash")[0].offsetWidth + document.getElementsByClassName("artistName")[0].offsetWidth);
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
		
		//return previous best if available. Reads from snapshot during mode 1
		//so the `v-if="hasPreviousBest()"` block in the results view survives
		//tracker reset (which fires on songID change in NSP, before the
		//min-hold expires).
		hasPreviousBest: function() {
			if (this.mode === 1 && this.snapshotHasPreviousBest !== null) {
				return this.snapshotHasPreviousBest;
			}
			return tracker.hasPreviousBest();
		},

		//Return trackerScore. Same snapshot pattern as hasPreviousBest.
		trackerScore: function() {
			if (this.mode === 1 && this.snapshotFinal !== null) {
				return this.snapshotFinal;
			}
			return tracker.getFinal();
		}
	},
	
	//Grab variables for UI
	computed: {
		
		//Get song details. In mode 1, read from prevData so the marquee/album art
		//reference the song that just ended - in NSP, snifferData.songDetails already
		//points at the next queued song.
		song: function() {
			if (this.mode === 1 && this.prevData && this.prevData.songDetails) {
				return this.prevData.songDetails;
			}
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
			const currentPhrase = poller.getCurrentPhrase();
			// Defensive null check
			if(currentPhrase == null){return 0;}
			if(currentPhrase.index == 0){return 0;}
			return (currentPhrase.startTime / this.song.songLength) * 100;
		},
		
		//Calculate phrase height from difficulty
		phraseHeight: function() {
			if (this.readout.songTimer == 0){return 0;}
			let phraseHeight = 1;
			let maxDif = poller.getMaxDif();
			let phrase = poller.getCurrentPhrase();
			if(maxDif != 0){
				phraseHeight = phrase.maxDifficulty/maxDif;
			}
			return phraseHeight*100;
		},		
		
		//Get current arrangement: arrangementID direct match -> currentPath filter
		//(first non-bonus/non-alternate match wins, bonus allowed as fallback).
		arrangement: function() {
			//Shared resolver (sniffer-poller.js): arrangementID direct match, then
			//currentPath filter. Passing this.song keeps mode-1 resolution bound to
			//the displayed (prevData) song even after the poller has advanced to the
			//next Nonstop song.
			if(this.song == null) {return null;}
			return poller.resolveArrangement(this.song, this.readout);
		},
		
		//Get tuning name
        tuningName: function() {
            if(this.arrangement == null) {return null;}
			return this.arrangement.tuning.TuningName;		
        },
		
		//Create and draw sections
		sections: function() {
			arrangement = this.arrangement;

			if(arrangement == null) {return null;}			
			
			let sections = arrangement.sections;

			let songLength = this.song.songLength;
			
			//Cycle through all sections and draw
			for (let i = 0; i < sections.length; i++) {
				let section = sections[i];

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
				if(this.readout.songTimer > section.startTime && this.readout.songTimer <= section.endTime){
					section.style.backgroundColor = "royalblue";
				}
				
				//If has previous best, color based on that. If not, then color using accuracy gradient.
				//Note: && is required (not bitwise &) so hasPreviousBest() short-circuits and getSectionAccuracy()
				//is not called when there is no previous best to compare against.
				if (this.readout.songTimer > section.endTime || this.readout.gameStage == "panel_bib" || this.readout.gameStage == "sa_songreview" || this.readout.gameStage == "las_songreview"){
					if(tracker.hasPreviousBest() && tracker.getSectionAccuracy((section.startTime + section.endTime)/2) != 'Rest') {
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
			arrangement = this.arrangement;

			if(arrangement == null) {return null;}			
			
			let phraseIterations = arrangement.phraseIterations;

			songLength = this.song.songLength;
					
			maxDif = poller.getMaxDif();		
			
			//Cycle through phrases and draw
			for (let i = 0; i < phraseIterations.length; i++) {
				phrase = phraseIterations[i];

				phrase.length = phrase.endTime - phrase.startTime;

				phrase.startPercent = (phrase.startTime / songLength) * 100;
				
				//Always make the first phrase start from 0%
				if(i == 0) {
					phrase.length =  phrase.endTime;
					phrase.startPercent = 0;
				}

				phrase.endPercent = (phrase.endTime / songLength) * 100;

				phrase.lengthPercent = (phrase.length / songLength) * 100;
				
				phraseHeight = 1;
				
				if(phrase.maxDifficulty > maxDif){maxDif = phrase.maxDifficulty}
				
				if(maxDif != 0){
					phraseHeight = phrase.maxDifficulty/maxDif;
				}
				
				phrase.style = {
					left: phrase.startPercent+'%',
					width: (phrase.lengthPercent-(100/(widthUI)))+'%',
					height: Math.round((phraseHeight)*100)+'%'
				}

				//If phrase grade exists, color based on that; else, use accuracy gradient
				if (this.readout.songTimer > phrase.endTime || this.readout.gameStage == "panel_bib" || this.readout.gameStage == "sa_songreview"  || this.readout.gameStage == "las_songreview"){
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
			
			for (let i = this.prevSong.arrangements.length - 1; i >= 0; i--) {
				arrangement = this.prevSong.arrangements[i];

				if(arrangement.arrangementID.length == 32 && arrangement.arrangementID == this.prevReadout.arrangementID) {
					return arrangement;
				}
			}
			return null;
		},
		
		//Get previous path info
		prevPath: function() {
			if(this.prevSong == null){return null;}
			//Defensive: prevArrangement returns null when no entry in prevSong.arrangements matches
			//prevReadout.arrangementID - which is the case in Nonstop transitions when memoryReadout.arrangementID
			//becomes junk (e.g. "Fear Inoculum", "urn:image:dds:album_..."). Without this guard, .type
			//throws TypeError, killing the Vue render.
			if(this.prevArrangement == null){return null;}
			return this.prevArrangement.type;
		},
		
		//Get previous sections and draw results screen
		prevSections: function() {
			arrangement = this.prevArrangement;

			if(arrangement == null) {return null;}

			sections = arrangement.sections;

			songLength = this.prevSong.songLength;

			for (let i = 0; i < sections.length; i++) {
				section = sections[i];

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
			arrangement = this.prevArrangement;

			if(arrangement == null) {return null;}

			phraseIterations = arrangement.phraseIterations;

			songLength = this.prevSong.songLength;
			
			maxDif = poller.getMaxDif();		
			
			for (let i = 0; i < phraseIterations.length; i++) {
				phrase = phraseIterations[i];

				phrase.length = phrase.endTime - phrase.startTime;

				phrase.startPercent = (phrase.startTime / songLength) * 100;
				
				//Always make the first phrase start from 0%
				if(i == 0) {
					phrase.length =  phrase.endTime;
					phrase.startPercent = 0;
				}

				phrase.endPercent = (phrase.endTime / songLength) * 100;

				phrase.lengthPercent = (phrase.length / songLength) * 100;
				
				phraseHeight = 1;
				
				if(phrase.maxDifficulty > maxDif){maxDif = phrase.maxDifficulty}
				
				if(maxDif != 0){
					phraseHeight = phrase.maxDifficulty/maxDif;
				}
				
				phrase.style = {
					left: phrase.startPercent+'%',
					width: (phrase.lengthPercent-(100/(widthUI)))+'%',
					height: Math.round((phraseHeight)*100)+'%'
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
	if (time < 0) {
		return "";
	}

	const minutes = Math.floor(time / 60);
	const seconds = time % 60;

	return [minutes, seconds].map(X => ('0' + Math.floor(X)).slice(-2)).join(':')
}

//Generate feedback
function generateFeedback() {
	app.feedback = [];

	arrangement = poller.getCurrentArrangement();
	//Defensive: getCurrentArrangement can return null in Nonstop Play transitions when memoryReadout.arrangementID
	//is junk and none of the fallback paths match. Without this guard, `arrangement.sections` throws TypeError,
	//propagating out of _doOnSongEnded -> gotData and aborting the poll BEFORE _doOnData runs - which means
	//app.snifferData isn't updated and the entire UI freezes. Falling back to a generic feedback line keeps
	//the data pipeline alive.
	if(arrangement == null) {
		app.feedback = ["YOU TRIED!"];
		app.cycleFeedback();
		hideTimeout = setTimeout(() => {if(app.mode == 1) {app.mode = 0; app.visible = false;}}, 60000);
		return;
	}
	sections = arrangement.sections;
	let feedback = []

	let greens = 0;

	for (let i = sections.length - 1; i >= 0; i--) {
		section = sections[i];
		const rel = tracker.getRelative(section.endTime);

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

// Shared mode-1 results min-hold (implementation in sniffer-poller.js).
poller.enableResultsHold(app);
