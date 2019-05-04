//OBS websocket details
var obs_ip = "localhost";
var obs_port = 4444;
var obs_password = "who needs a password anyway";

var songID = "";
var poller = new SnifferPoller({
	interval: 500,

	onData: function(data) {
		songDisplay.addonData = data;

		if(data.memoryReadout !== null) {
			timeline.setCustomTime(timeToDate(data.memoryReadout.songTimer));
		}

		if(data.songDetails !== null) {
			if(data.songDetails.songID != songID) {
				songID = data.songDetails.songID;

				loadTimeline();

				timeline.getOptions().max = timeToDate(data.songDetails.songLength);
				timeline.redraw();
			}
		}

		evalSequencer();
	}
});

var events = {
	"Scene": {
		desc: "Switch to scene",
		start: function(row) {
			
		},
		end: function(row) {
			obs.SetCurrentScene({"scene-name": row.sceneName});
		},
		getRow: function(options, editing) {
			return {
				content: "Switch to "+options.scene,
				sceneName: options.scene
			};
		},
		options: {
			"scene": {
				name: "Scene name",
				type: "select",
				options: function() {
					return obs_scenes.map(x => x.name).sort(ialphabetically);
				}
			}
		}
	},
	"Source": {
		desc: "Show source",
		start: function(row) {
			obs.SetSceneItemProperties({"scene-name": row.sceneName, "item": row.sourceName, "visible": true})
		},
		end: function(row) {
			obs.SetSceneItemProperties({"scene-name": row.sceneName, "item": row.sourceName, "visible": false})
		},
		getRow: function(options, editing) {
			var curRow = timeline.getItem(getSelectedRow());

			var newrow = {
				content: options.source+" in "+options.scene,
				sceneName: options.scene,
				sourceName: options.source
			};

			if(editing) {
				newrow.start = curRow.start;
				newrow.end = curRow.end;
			} else {
				newrow.end = new Date(curRow.start.getTime() + (10 * 1000));
			}

			return newrow;
		},
		options: {
			"scene": {
				name: "Scene name",
				type: "select",
				options: function(curOptions) {
					return obs_scenes.map(x => x.name).sort(ialphabetically);
				}
			},
			"source": {
				name: "Source name",
				type: "select",
				options: function(curOptions) {
					var curScene = obs_scenes.find(function(x) {
						return x.name == curOptions.scene;
					});

					if(typeof(curScene) !== "undefined") {
						return curScene.sources.map(x => x.name).sort(ialphabetically);
					}

					return null;
				}
			}
		}
	}
};

//JQuerys document.onReady function
//Gets called after the webpage is loaded
$(function() {
	$("div#eventDialog").dialog({
		title: "Add event",
		autoOpen: false,
		modal: true,
		buttons: {
			"Go": function() {
				var event = events[eventDialog.currentET];

				var opts = event.options;

				var builtops = {};

				for(var key in opts) {
					builtops[key] = $(this).find("#"+key).val();
				}


				//Hey, I know its ugly, but it works
				var row = event.getRow(builtops, $(this).dialog("option","title").toLowerCase().includes("edit"));

				row["event"] = eventDialog.currentET;

				updateSelectedRow(row);

				$(this).dialog("close");
			},
			"Cancel": function() {
				if(!$(this).dialog("option","title").toLowerCase().includes("edit")) {
					timeline.deleteItem(timeline.selection.index)
				}

				$(this).dialog("close");
			}
		}
	});

	obs = new OBSWebSocket();
	obs.connect({address: obs_ip+":"+obs_port, password:obs_password}).then(refreshOBS);

	storage = new SnifferStorage("timeline");

	songDisplay = new Vue({
		el: "#songDisplay",
		data: {
			addonData: null
		},
		computed: {
			status: function() {
				var status = "";

				if(obs._connected) {
					status += "Connected to OBS, ";
				}
				else {
					status += "Not connected to OBS, ";
				}

				if(this.addonData === null) {
					status += "Cannot connect to RockSniffer";
				}
				else {
					status += "Connected to RockSniffer " + this.addonData.Version;
				}

				return status;
			}
		}
	});

	eventDialog = new Vue({
		el: "form#eventDialog",
		data: {
			currentET: null,
			curOptions: {

			}
		},
		computed: {
			eventTypes: function() {
				return Object.keys(events);
			},
			curEvent: function() {
				return events[this.currentET];
			}
		}
	});

	timeline = new links.Timeline(document.getElementById("timeline"));

	timeline.step.getLabelMinor = function(options, date) {
	    if (date == undefined) {
	        date = this.current;
	    }

	    switch (this.scale) {
	        case links.Timeline.StepDate.SCALE.MILLISECOND:
	        	return this.addZeros(date.getSeconds(), 2) + "." + String(date.getMilliseconds());
	        case links.Timeline.StepDate.SCALE.SECOND:
	        case links.Timeline.StepDate.SCALE.MINUTE:
	        case links.Timeline.StepDate.SCALE.HOUR:
	        	if(date.getHours() > 0)
	            	return this.addZeros(date.getHours(), 2) + ":" + this.addZeros(date.getMinutes(), 2) + ":" + this.addZeros(date.getSeconds(), 2);
            	return this.addZeros(date.getMinutes(), 2) + ":" + this.addZeros(date.getSeconds(), 2);
	        case links.Timeline.StepDate.SCALE.WEEKDAY:      return options.DAYS_SHORT[date.getDay()] + ' ' + date.getDate();
	        case links.Timeline.StepDate.SCALE.DAY:          return String(date.getDate());
	        case links.Timeline.StepDate.SCALE.MONTH:        return options.MONTHS_SHORT[date.getMonth()];   // month is zero based
	        case links.Timeline.StepDate.SCALE.YEAR:         return String(date.getFullYear());
	        default:                                         return "";
	    }
	};

	timeline.setOptions({
		'min': timeToDate(0),
		'start': timeToDate(0),
		'editable': true,
		'zoomMin': 1000,
		'zoomMax': 1000 * 60 * 4,
		'showMajorLabels': false,
		'showCurrentTime': false,
		'showCustomTime': true
	});

	var onedit = function () {
		$("div#eventDialog").dialog("option","title","Edit event").dialog("open");
	};

	// callback function for the add item
	var onadd = function () {
	    $("div#eventDialog").dialog("option","title","Add event").dialog("open");
	};

	links.events.addListener(timeline, 'add', onadd);
	links.events.addListener(timeline, 'edit', onedit);

	timeline.draw([]);
	timeline.move(0);

	timeline.setCustomTime(timeToDate(0))
});

var pastEvents = [];
var currentEvents = [];

function resetSequencer() {
	currentEvents = [];
	pastEvents = [];
}

function evalSequencer() {
	var sorted = timeline.getData().slice(0).sort(function(a,b) {
		return (a.start < b.start ? -1 : 1);
	});

	var ctime = timeline.getCustomTime();

	for (var i = 0; i < sorted.length; i++) {
		var event = sorted[i];

		var start = event.start;
		var end = event.end;

		if(typeof(end) === "undefined") {
			end = start;
		}

		if(pastEvents.includes(i)) {
			continue;
		}

		//If event has started
		if(ctime > start) {
			if(!currentEvents.includes(i)) {
				currentEvents.push(i);

				console.log("Start: " + event.content);
				events[event.event].start(event);
			}
		}

		if(ctime > end) {
			if(currentEvents.includes(i)) {
				pastEvents.push(i);

				console.log("End: " + event.content);
				events[event.event].end(event);
			}
		}
	}
}

function getSelectedRow() {
    var row = undefined;
    var sel = timeline.getSelection();

    if (sel.length) {
        if (sel[0].row != undefined) {
            row = sel[0].row;
        }
    }

    return row;
}

function updateSelectedRow(newRow) {
	var row = getSelectedRow();

	$.extend(timeline.getData()[row], newRow);

	timeline.redraw();
}

function clearTimeline() {
	timeline.deleteAllItems();
}

function saveTimeline() {
	if(typeof(songID) === "undefined" || songID === null || songID === "") {
		return;
	}

	storage.setValue(songID, timeline.getData());
}

function loadTimeline() {
	if(typeof(songID) === "undefined" || songID === null || songID === "") {
		return;
	}

	//Clear sequencer
	resetSequencer();

	storage.getValue(songID)
	.done(function(data) {
		var parsed = JSON.parse(data);

		if(parsed === null) {
			timeline.setData([]);
			return;
		}

		for (var i = parsed.length - 1; i >= 0; i--) {
			if(typeof(parsed[i].start) !== "undefined") {
				parsed[i].start = new Date(parsed[i].start);
			}

			if(typeof(parsed[i].end) !== "undefined") {
				parsed[i].end = new Date(parsed[i].end);
			}
		}

		timeline.setData(parsed);
	});
}

obs_scenes = [];
obs_sources = [];
function refreshOBS() {
	obs.GetSceneList().then(function(data) {obs_scenes = data.scenes});
	obs.GetSourcesList().then(function(data) {obs_sources = data.sources});
}

function timeToDate(tSeconds) {
	var hh = Math.floor(tSeconds / 3600);
	var mm = Math.floor((tSeconds - (hh * 3600)) / 60);
	var ss = Math.floor(tSeconds % 60);
	var ms = (tSeconds - Math.floor(tSeconds)) * 1000;

	return new Date(2000,0,1,hh,mm,ss,ms)
}

function dateToTime(date) {
	return (date.getMilliseconds() / 1000) + date.getSeconds() + (date.getMinutes() * 60) + (date.getHours() * 60 * 60);
}

//Convert a number to a duration "hh:mm:ss"
function durationString(tSeconds) {
	var hh = Math.floor(tSeconds / 3600);
	var mm = Math.floor((tSeconds - (hh * 3600)) / 60);
	var ss = Math.floor(tSeconds % 60);

	if(hh < 10) {hh = "0"+hh;}
	if(mm < 10) {mm = "0"+mm;}
	if(ss < 10) {ss = "0"+ss;}

	if(hh > 0) {
		return hh+":"+mm+":"+ss;
	} else {
		return mm+":"+ss;
	}
}

function ialphabetically(a,b) {
	a = a.toUpperCase();
	b = b.toUpperCase();

	return a.localeCompare(b);
}