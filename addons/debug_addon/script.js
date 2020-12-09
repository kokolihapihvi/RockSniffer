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
		$("div.data").html("<pre>"+JSON.stringify(data, null, 4)+"</pre");
	});
}