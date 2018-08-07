//Addon service ip and port
var ip = "127.0.0.1";
var port = 9938;

//How often to poll the addon service (in milliseconds)
var pollrate = 900;

//JQuerys document.onReady function
//Gets called after the webpage is loaded
$(function() {
	//Set a timer to refresh our data
	setInterval(refresh, pollrate);
	refresh();
});

function refresh() {
	//JSON query the addon service
	$.get("http://"+ip+":"+port, function(data) {
		$("div.data").html(DumpObjectIndented(data));
	});
}

//based on https://stackoverflow.com/a/130504
function DumpObjectIndented(obj)
{
	var nl = "<br>";

	var oi = "<div class='ind'>";
	var ci = "</div>";

	var result = oi;

	for (var property in obj) {
		var value = obj[property];

		if (typeof value == 'string') {
			value = "'" + value + "'";
		} else if (typeof value == 'object') {
			if (value instanceof Array) {
				// Just let JS convert the Array to a string!
				value = "[ " + value + " ]";
			} else if (value === null) {
				value = "null";
			} else {
				// Recursive dump
				var od = DumpObjectIndented(value);

				value = nl + "{" + nl + od + "}";
			}
		}
		result += "'" + property + "': " + value + "," + nl;
	}

	result += ci;

	return result;
}