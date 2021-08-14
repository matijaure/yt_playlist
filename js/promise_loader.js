// Written by TheOnlyOne aka LumenTheFairy aka @modest_ralts

// create this script's namespace
pl = {};

// wrap the window's onload event in a Promise
pl.load_body = new Promise( function(resolve, reject) {
	window.addEventListener('load', resolve);
});

// wrap the document DOM load event in a Promise
pl.build_dom = new Promise( function(resolve, reject) {
	document.addEventListener('DOMContentLoaded', resolve);
});

// creates an error message using the given information
pl.format_error = function(what, url, name, rest) {
	let tag = "";
	if(url) {
		tag = " [";
		if(name) { tag += name + " @ "; };
		tag += url + "]";
	}
	let message = "Error encountered while " + what + tag;
	if(rest) { message += ":\n" + rest; };
	return message;
};

// list of types that can currently be handled by this loader
pl.known_types = new Set(['external_script', 'script', 'json', 'image', 'image_data', 'process']);

// list of dependencies that are handled automatically, and thus cannot be used as item names
// empty string is just illegal
pl.reserved_names = new Set(['dom', 'body', ''])

// used for default logging 
pl.log_start = (name) => console.log("Started " + name);
pl.log_finish = (name, result) => console.log("Finished " + name);

//sets the values of a given object using the given parameters,
//or uses the default parameters if none are provided
pl.set_parameters = function(obj, parameters, defaults) {
	Object.keys(defaults).forEach( function(p) {
		if(parameters.hasOwnProperty(p)) {
			obj[p] = parameters[p];
		} else {
			obj[p] = defaults[p];
		}
	});
};


// constructor a for a Loader
// options should contain overrides for the default Loader parameters
// throws a TypeError if allow_reload=true but should_store_results=false
pl.Loader = function(namespace, manifest, options={}) {
	this.namespace = namespace;
	this.manifest = manifest;

	//set the options
	pl.set_parameters(this, options, {
		fast_fail: true,            // if true, any rejected Promise in the graph will prevent further Promises from starting
		should_log: false,          // if true, log functions will be called at the start and end of each Promise
		log_start: pl.log_start,    // the function to run that logs the start of each item. Is given the item's name as a parameter, with the loader as the this context
		log_finish: pl.log_finish,  // the function to run that logs the end of each item. Is given the item's name and results as parameters, with the loader as the this context
		should_store_results: true, // if false, intermediate results will not be stored in this.results; any important results must be saved using processes.
	});

	this.results = {};
	this.compile_manifest();
};

// adds a field to the current result if the Loader has been set to do so, and only if name is not falsy
// result here is expected to be an object with the fields to add
pl.Loader.prototype.add_to_result = function(name, result) {
	if(this.should_store_results && name) {
		if(this.results.hasOwnProperty(name)) {
			this.results[name] = Object.assign( this.results[name], result );
		} else {
			this.results[name] = result;
		}
	}
};

// returns the promiser for the given item, based on its type
// this function assumes the item has already been type checked by the compile_manifest() function
pl.Loader.prototype.get_promiser = function(item) {
	switch(item.type) {
		case 'external_script': return this.load_script(item.url, item.name, true);
		case 'script': return this.run_script(item.name);
		case 'json': return this.load_json(item.url, item.name);
		case 'image': return this.load_image(item.url, item.name);
		case 'image_data': return this.load_image_data(item.url, item.name);
		case 'process': return this.run_process(item.process, item.name);
	}
};

// reads the manifest of items and compiles it into a more easily usable form
// this is called by the constructor
// it can throw TypeError in case the manifest is invalid for one of the following reasons:
//  an item uses a reserved name
//  item names are not unique
//  a resource type is missing the 'url' property
//  a 'process' type or the 'final' item is missing the 'process' property
//  an item is missing the 'name' property
//  an item other than 'final' is missing the 'type' property
//  an unknown type is encountered
//  a dependency is not the name of another item, or a reserved name
//  an item is dependent on 'final'
//  contains a dependency cycle
pl.Loader.prototype.compile_manifest = function() {

	// this is a list of promisers, that will be called when the Promise is ready to be made
	this._nodes = [];
	// this is a list parallel to nodes giving names to them, used solely for logging
	this._log_names = [];
	// this is a list of lists of indices of the nodes the given node depends on
	this._dependencies = [];
	// this is a list of lists of indices of the nodes that directly follow the given node
	this._followers = [];

	// maps each name to its index in the nodes list
	const names = new Map();
	// maps each name to the index that should be considered when reloading
	// this differs from the above in that 'script' items should use the index of the script load instead of the script run
	this._reload_lookup = new Map();
	// keep track of which nodes are auxiliary
	this._auxiliary_indices = new Set();
	// keep track of whether or not the manifest contains a custom 'final' item
	let has_final = false;

	// adds a node to the nodes list, stores its log name, updates the index map, and initializes the node's dependencies
	const add_node = ( function(item, promiser) {
		names.set(item.name, this._nodes.length);
		this._nodes.push( promiser );
		this._log_names.push( item.name );
		this._dependencies.push( [] );
		this._followers.push( [] );
	} ).bind(this);

	// adds an unnamed node to the list; initializing its dependencies
	// we still give it a name for logging purposes
	const add_auxiliary_node = ( function(item, promiser) {
		this._auxiliary_indices.add( this._nodes.length );
		this._nodes.push( promiser );
		this._log_names.push( item.name + "_load" );
		this._dependencies.push( [] );
		this._followers.push( [] );
	} ).bind(this);

	this.manifest.forEach( function(item) {
		// confirm the item has a name
		if(!item.hasOwnProperty('name')) {
			throw TypeError('Loader manifest contains an item without a name.');
		}
		// mark that an operation has been specified for 'final'
		if(item.name === 'final') {
			has_final = true;
			item.type = 'process';
			// confirm the 'final' item has a process
			if(!item.hasOwnProperty('process')) {
				throw TypeError('Loader manifest\'s "final" item does not have a designated "process".');
			}
		}
		// anything other than 'final' must have a type, and it must be recognized
		else {
			if(!item.hasOwnProperty('type')) {
				throw TypeError('Loader manifest\'s item "' + item.name + '" has no "type".');
			}
			if(!pl.known_types.has(item.type)) {
				throw TypeError('Loader manifest\'s item "' + item.name + '" has unrecognized type "' + item.type + '".');
			}
			// make sure process items have a 'process' field
			if(item.type === 'process') {
				if(!item.hasOwnProperty('process')) {
					throw TypeError('Loader manifest\'s process item "' + item.name + '" has no specified "process".');
				}
			}
			// make sure other resources have a url
			else {
				if(!item.hasOwnProperty('url')) {
					throw TypeError('Loader manifest\'s resource item "' + item.name + '" has no specified "url".');
				}
			}
		}
		// confirm that names are unique and do not use a reserved name
		if(pl.reserved_names.has(item.name)) {
			throw TypeError('Loader manifest cannot contain an item with the reserved name "' + item.name +'".');
		}
		if(names.has(item.name)) {
			throw TypeError('Loader manifest must contain unique item names. Item "' + item.name + '" appears at least twice.');
		}
		//add the name to the reload lookup
		//doing this before spitting a script ensures the script's auxiliary node is the index we use for reload
		this._reload_lookup.set(item.name, this._nodes.length);
		// if this item is a script, we split it into two nodes, the first loads the script, and the second runs it
		if(item.type === 'script') {
			add_auxiliary_node( item, this.load_script(item.url, item.name, false) );
		}
		// map this item name to the location (note that for scripts, the previous index will be the added auxiliary node)
		add_node(item, this.get_promiser(item) );
	}, this);
	// reserved items:
	// these ugly lines are creating promises that wait for the load, and then add and return a (honestly fairly arbitrary) result
	add_node( {name: 'dom'}, () => pl.build_dom.then( (function() { this.add_to_result('dom', { value: document }); return document;}).bind(this) ) );
	add_node( {name: 'body'}, () => pl.load_body.then( (function() { this.add_to_result('body', { value: window }); return window;}).bind(this) ) );
	// add the default final promiser if it has not been replaced
	if(!has_final) {
		add_node( {name: 'final'}, this.default_final.bind(this) );
	}

	// work out the graph of dependencies
	this.manifest.forEach( function(item) {
		// ignore the 'final' node for now
		if(item.name !== 'final') {
			// get this item's node index
			const index = names.get(item.name);
			// if the node has no 'dependencies' property, assume an empty dependencies list
			let dependencies = [];
			// otherwise, get them out
			if(item.hasOwnProperty('dependencies')) {
				dependencies = item.dependencies;
			}
			// map the dependencies to their node indices
			this._dependencies[index] = dependencies.map( function(dep) {
				// check that the dependency exists in the manifest, and is not the 'final' node
				if( !names.has(dep) ) {
					throw TypeError('Loader manifest\'s item "' + item.name + '" depends on non-existent item "' + dep + '".');
				}
				if( dep === 'final' ) {
					throw TypeError('Loader manifest\'s item "' + item.name + '" depends "final".');
				}
				const dep_index = names.get(dep);
				this._followers[dep_index].push(index);
				return dep_index;
			}, this);
			// scripts also depend on the auxiliary load, which was the previous node in the list
			if(item.type === 'script') {
				this._dependencies[index].unshift(index - 1);
				this._followers[index - 1].push(index);
			}
		}
	}, this);
	// takes a list of lists and returns a list of the indices of the empty inner lists, ignoring the final index
	// yes, there is a clever way to do this with map and filter; sorry, it's kind of ugly
	const final_index = names.get('final');
	this._final_index = final_index;
	let get_indices_of_empty = function( list ) {
		let retval = [];
		list.forEach( function(inner_list, i) {
			if(i !== final_index && inner_list.length === 0) retval.push(i);
		} );
		return retval;
	};

	// detect directed cycles... sorry for lack of comments on standard graph algorithm...
	const visited = new Set();
	const paths = this._nodes.map( (_) => [] );
	this._nodes.forEach( function(_, root) {
		if(visited.has(root)) return;
		const ready = [root];
		while(ready.length > 0) {
			const cur_index = ready.pop();
			visited.add(cur_index);
			const cur_path = paths[cur_index].slice();
			cur_path.push(cur_index);
			this._followers[cur_index].forEach( function(follower) {
				if(visited.has(follower)) {
					if(paths[cur_index].includes(follower)) {
						let cycle_start = paths[cur_index].indexOf(follower);
						let cycle = paths[cur_index].slice(cycle_start);
						cycle.push(cur_index);
						cycle.push(follower);
						let cycle_text = cycle.map( (i) => this._log_names[i] ).join(" -> ");
						throw TypeError('Loader contains a directed cycle: ' + cycle_text);
					}
				} else {
					paths[follower] = cur_path;
					ready.push(follower);
				}
			}, this);
		};
	}, this);

	// calculate sources and sinks in the graph
	this._sources = get_indices_of_empty(this._dependencies);
	this._sinks = get_indices_of_empty(this._followers);
	// the final node depends on everything else, but to simplify, it only needs to directly depend on the sinks of the graph
	this._dependencies[final_index] = this._sinks;
	this._sinks.forEach( ((node) => this._followers[node].push(final_index)), this );
	// now the final node is the only sink
	this._sinks = [final_index];
	// hold on to the final index
	this._final_index = final_index;
};

// returns a promise to load or run each step from the manifest listed in sources,
// and then, recursively, to load or run everything that depends on them
//   sources is an array of indices from which to base the loading on
//     for a complete load, this will be the list of the actual sources of the graph
//   reused_results is a set of the indices of the nodes whose results are assumed to already be present
//     for a complete load, this set will be empty
pl.Loader.prototype._load = function(sources, reused_results) {
	//bind this so it can still be used in the Promises
	const loader = this;
	// hold on to a list of the created Promises, one for each node in the graph
	const promises = this._nodes.map( (_) => null );
	// keep track of which Promises have been created
	const visited = new Set();
	// keep track of which nodes each node still depends on,
	// this will not include any reused results, but we need to create a promise for the reused results
	const remaining_dependencies = this._dependencies.map( function(deps) {
	 	let remaining_deps = new Set(deps);
	 	reused_results.forEach( function(reused_index) {
	 		//in the case there are dependencies we assume are taken care of...
	 		if(remaining_deps.has(reused_index)) {
	 			//remove it from the remaining decencies set
	 			remaining_deps.delete(reused_index);
				// and create a promise that resolves to the stored result value, if there is one
	 			promises[reused_index] = new Promise( function(resolve, reject) {
	 				if(loader._auxiliary_indices.has(reused_index)) {
	 					//if this was an auxiliary node, check the auxiliary value
						const result = loader.results[loader._log_names[reused_index + 1]];
						if(result && result.hasOwnProperty('aux')) resolve(result.aux);
	 				}
	 				else {
	 					//otherwise, check the normal stored value
						const result = loader.results[loader._log_names[reused_index]];
						if(result && result.hasOwnProperty('value')) resolve(result.value);
					}
					reject("Could not reload: dependency '" + loader._log_names[reused_index] + "' does not have a stored result.");
				});
	 		}
	 	});
	 	return remaining_deps;
	});
	// make a queue of indices ready to be converted into Promises, starting with the sources of the graph
	const ready_nodes = sources.slice(); //slice with no arguments just copies the Array

	// for 'fast_fail'ing loads, checks if the full promise has ultimately failed
	// if so, reject immediately, otherwise, resolve immediately
	const check_should_fail = (value) => new Promise( function(resolve, reject) {
		if(loader.fast_fail) { promises[loader._final_index].catch( reject ); }
		resolve(value);
	});

	// make promises until there are no more ready to be made
	while( ready_nodes.length > 0 ) {
		// remove a ready node
		const cur_index = ready_nodes.pop();
		// get the promises this node depends on
		const dependent_promises = this._dependencies[cur_index].map( (i) => promises[i] );
		// create the Promise for this node
		promises[cur_index] = Promise.all( dependent_promises ) //await the previous promises
								.then( check_should_fail )      //give up right away if the rest of the load will fail somewhere
								.then( this.log(this._log_names[cur_index], true) )  //log the start of the item
								.then( this._nodes[cur_index] ) //actually begin this node's Promise
								.then( this.log(this._log_names[cur_index], false) ) //log the end of the item
		// remove this node from the remaining dependencies of its followers
		this._followers[cur_index].forEach( function(follower) {
			remaining_dependencies[follower].delete(cur_index);
			// if there are no more dependencies, the node is ready to be converted to a Promise
			if(remaining_dependencies[follower].size === 0) {
				ready_nodes.push(follower);
			}
		});
	};

	// return the Promise of the final node, since it culminates the completion of the load
	return promises[this._final_index];
};

// returns a Promise to load all the files, and run all of the processes in the manifest
pl.Loader.prototype.load = function() {
	return this._load(this._sources, new Set());
}

// returns a Promise to reload or rerun all of the requested files or processes
//   requests should be an array of strings, naming elements from the manifest
// note that when we reload, we run only what is recursively dependent on the requests
// some of these dependent processes may themselves depend on something that we are not reloading or rerunning
// in this case, the stored results are used
// however, if the results were not stored (because should_store_results=false, or a fast fail caused a reachable node not to run),
// or they were altered externally, the reload may fail
pl.Loader.prototype.reload = function(requests) {
	//lookup the request names to get their indices
	let request_indices = requests.map( this._reload_lookup.get.bind(this._reload_lookup) );
	//create a set of indices of the nodes that will end up being reprocessed
	//do this by just searching from the requested indices
	let reprocessed_nodes = new Set(request_indices);
	let frontier = request_indices.slice();//slice with no parameters copies the array
	while( frontier.length > 0 ) {
		const cur_index = frontier.pop();
		this._followers[cur_index].forEach( function(follower) {
			if(!reprocessed_nodes.has(follower)) {
				reprocessed_nodes.add(follower)
				frontier.push(follower);
			}
		});
	};
	//create a set of indices of the nodes whose previous results must be reused to do the reload
	//this is the set of any dependencies of a reprocessed node that is itself not a reprocessed node
	let reused_result_nodes = new Set();
	reprocessed_nodes.forEach( function(index) {
		this._dependencies[index].forEach( function(dep) {
			if(!reprocessed_nodes.has(dep)) {
				reused_result_nodes.add(dep);
			}
		});
	}, this);
	//call the load with these calculated parameters
	return this._load( request_indices, reused_result_nodes );
}

// returns a promiser that returns a Promise to log the start or end of an item, passing the previous result through
// name is the name of the item, start is true for the start of the item, false for the end
pl.Loader.prototype.log = function(name, start=true) {
	//bind this so it can still be used in the Promise
	const loader = this;
	return function(val) {
		if(loader.should_log) {
			try {
				if(start) loader.log_start.apply(loader, [name]);
				else loader.log_finish.apply(loader, [name]);
			}
			// report the error but don't crash the Promise chain
			catch(err) {
				console.error(err)
			}
		}
		return val;
	};
};

// used as the default 'final' Promise that is run after everything else in the manifest is loaded and processed
pl.Loader.prototype.default_final = function() {
	return Promise.resolve(this.results);
};

// returns a promiser that returns a Promise to run a process
//  process is the function to be run, which will be passed the results of the item's dependencies, in order, using the Loader as this
//  name is the name of the process item, or, if falsy, the results will not be stored
// the value of a fulfilled Promise is the return value of the process (or undefined if there is none)
pl.Loader.prototype.run_process = function(process, name) {
	//bind this so it can still be used in the Promise
	const loader = this;
	//make the promiser
	return (deps) => new Promise( function(resolve, reject) {
		try {
			let result = process.apply(loader, deps);
			loader.add_to_result(name, { value: result });
			resolve(result);
		}
		//the process can certainly throw errors, catch them here
		catch(err) {
			err.message = pl.format_error("running the process", name, null, err.message);
			reject(err);
		}
	});
};

// returns a promiser that returns a Promise to load a script
//  url is the path to the file
//  name is the name of script item, and also the name of the function we are expecting to load ( in the form {namespace}.scripts.{name} )
//  is_external indicates that the script is external and should just be run on load as-is
// this function only attempts to load the script file; it will not run the function contained within
// a successfully loaded function is stored in the Loader's scripts object, and the Promise will resolve with the function as it's value
pl.Loader.prototype.load_script = function(url, name, is_external) {
	//bind this so it can still be used in the Promise
	const loader = this;
	//make the promiser
	return () => new Promise( function(resolve, reject) {
		//create an element for the script
		let script = document.createElement('script');
		document.getElementsByTagName('head')[0].appendChild(script);

		//on successful load
		script.onload = function() {
			//remove the now excess dom element
			script.remove();

			//if this is an external script, it runs immediately and has no value we can retrieve
			if(is_external) {
				let result = null;
				loader.add_to_result(name, { value: result });
				resolve(result);
			}
			//otherwise, don't actually run the script yet; just check that the function naming is correct
			//if the function had a syntax error, it will also not appear in the scripts object
			else if( loader.namespace.scripts.hasOwnProperty(name) ) {
				//store the script, and pass it forward
				let result = loader.namespace.scripts[name];
				loader.add_to_result(name, { aux: result });
				resolve(result);
			}
			else {
				reject( ReferenceError( pl.format_error("checking the loaded script", url, name, "It does not contain the expected function {namespace}.scripts." + name + "\n(Note that this may have been due to a syntax error in the script. If this is the case, there will be a separate relevant syntax error.)") ) );
			}
		};
		//the script failed to load
		script.onerror = function(err) {
			//remove the now excess dom element
			script.remove();
			//reject the Promise
			reject( Error( pl.format_error("loading script", url, name) ) );
		};

		//actually ask the page to load the file
		script.async = true;
		script.src = url;
	});
};

// returns a promiser that takes the function from a loaded script and returns a Promise to run it
//  name is the name of the script
// the result of running a script is any return value it may have had (or undefined if it had none)
pl.Loader.prototype.run_script = function(name) {
	//bind this so it can still be used in the Promise
	const loader = this;
	//make the promiser
	return (deps) => new Promise( function(resolve, reject) {
		//try running the script
		try {
			const script = deps[0];
			//this might throw an error, so make sure to catch it and reject the Promise
			let result = script.apply( loader, deps.slice(1) );
			//store the result, and pass the result forward
			loader.add_to_result(name, { value: result });
			resolve(result);
		} catch(err) {
			err.message = pl.format_error("running the loaded script", name, null, err.message);
			reject(err);
		}
	});
};

// shortcut composition method for loading and running scripts
// not used in the main loader, but can be useful for quickly reloading a script or for testing
pl.Loader.prototype.load_and_run_script = function(url, name) {
	return () => Promise.all( [this.load_script(name, url)()] )
				.then( this.run_script(name) );
};

// returns a promiser that returns a Promise to load and parse a json file
//  url is the path to the file
//  name is the name of the json item, or, if falsy, the results will not be stored
// the value of a fulfilled promise is the parsed json object
pl.Loader.prototype.load_json = function(url, name) {
	//bind this so it can still be used in the Promise
	const loader = this;
	//make the promiser
	return () => new Promise( function(resolve, reject) {
		//create a http request
		let request = new XMLHttpRequest();
		request.open('GET', url);
		//lets the request know to expect a json file
		request.overrideMimeType("application/json");
		//await the eventual load or failure of the request
		request.onreadystatechange = function() {
			if(request.readyState === XMLHttpRequest.DONE) {
				if(request.status === 200) {
					//parse the json and store it in the results
					try {
						let result = JSON.parse(request.responseText);
						loader.add_to_result(name, { value: result });
						resolve(result);
					} catch(err) {
						//catch any parsing errors and reject
						err.message = pl.format_error("parsing json", url, name, err.message);
						reject(err);
					}
				} else {
					reject( Error( pl.format_error("loading json", url, name, "Status code: " + request.status) ) );
				};
			};
		};
		//perform the load
		request.send();
	});
};

// returns a promiser that returns a Promise to load an image
//  url is the path to the file
//  name is the name of the image item, or, if falsy, the results will not be stored
// the value of a fulfilled promise is a img DOM element
pl.Loader.prototype.load_image = function(url, name) {
	//bind this so it can still be used in the Promise
	const loader = this;
	//make the promiser
	return () => new Promise( function(resolve, reject) {
		//creates an in-memory img element with the given image
		let img_elem = document.createElement('IMG');
		//await the image's eventual load or failure
		img_elem.onload = function() {
			loader.add_to_result(name, { value: this });
			resolve(this);
		};
		//the image failed to load
		img_elem.onerror = function(err) {
			reject( Error( pl.format_error("loading image", url, name) ) );
		};
		//actually load the image
		img_elem.src = url;
	});
};

// returns a promiser that returns a Promise to get the image data out of an image
//  name is the name of the image item, or, if falsy, the results will not be stored
// the value of a fulfilled promise is an ImageData object
pl.Loader.prototype.get_image_data = function(name) {
	//bind this so it can still be used in the Promise
	const loader = this;
	//make the promiser
	return (deps) => new Promise( function(resolve, reject) {
		try {
			const img_elem = deps[0];
			//create a canvas to get the image's pixel data
			const canvas = document.createElement('CANVAS');
			//copy the width and height
			canvas.width = img_elem.width;
			canvas.height = img_elem.height;
			//get a 2d canvas context from the canvas
			const context = canvas.getContext('2d');
			//copy the image to the canvas
			context.drawImage(img_elem, 0, 0, img_elem.width, img_elem.height);
			//store the imageData from the canvas as our result
			let result = context.getImageData(0, 0, img_elem.width, img_elem.height);

			loader.add_to_result(name, { value: result });

			resolve(result);
		} catch(err) {
			//catch any image creation or cross-origin security errors
			let message = pl.format_error("extracting image data", name, null, err.message);
			reject(Error(message));
		};
	});
};

// returns a promiser that returns a Promise to load an image and extract its imageData
//  url is the path to the file
//  name is the name of the image item, or, if falsy, the results will not be stored
// the value of a fulfilled promise is an imageData object
// the intermediate DOM element is not stored when using this Promise composition function
pl.Loader.prototype.load_image_data = function(url, name) {
	return () => Promise.all( [this.load_image(url)()] )
				.then( this.get_image_data(name) );
};