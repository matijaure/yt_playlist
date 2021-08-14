//declare the namespace for the project
const yp = {};
//give the namespace a place to hold the loaded scripts
//note that this property's name is required to be "scripts"
yp.scripts = {};


//create the list of things to load, and processes to run
const manifest = [
	{name: 'player_api', dependencies: [], type: 'external_script', url: 'https://www.youtube.com/player_api' },

	{name: 'namedstore', dependencies: [], type: 'script', url: 'js/namedstore.js' },
	{name: 'start_store',
	 dependencies: ['namedstore'],
	 type: 'process',
	 process: function() { namedstore.setName('yp'); }
	},

	{name: 'songs', dependencies: [], type: 'script', url: 'data/songs.js' },
	{name: 'read_song_data', dependencies: ['songs'], type: 'script', url: 'js/read_song_data.js' },
	{name: 'song_order', dependencies: ['start_store', 'read_song_data'], type: 'script', url: 'js/song_order.js' },
	{name: 'setup_tags', dependencies: ['start_store'], type: 'script', url: 'js/setup_tags.js' },
	{name: 'info_display', dependencies: [], type: 'script', url: 'js/info_display.js' },

	{name: 'player', dependencies: ['start_store', 'player_api'], type: 'script', url: 'js/player.js' },
	{name: 'communication', dependencies: ['start_store', 'player'], type: 'script', url: 'js/communication.js' },
	{name: 'events', dependencies: ['start_store', 'player', 'communication'], type: 'script', url: 'js/events.js' },
	{name: 'main', dependencies: ['player'], type: 'script', url: 'js/main.js' },

	{name: 'attach_handlers',
	 dependencies: ['events', 'setup_tags', 'dom'],
	 type: 'process',
	 process: function(events) { events(); }
	},
	{name: 'run_setup_tags',
	 dependencies: ['setup_tags', 'song_order', 'dom'],
	 type: 'process',
	 process: function(setup_tags) { setup_tags(); }
	},
];

//create a loader with the default options
yp.loader = new pl.Loader(yp, manifest, { fast_fail: false, should_log: false } );
//run the loader
yp.loader.load().then(
	( (val) => null ),  //do nothing with the final value of the load
	( (err) => console.error(err) ) //log a load error
);
