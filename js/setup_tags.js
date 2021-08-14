yp.scripts.setup_tags = function() {

const tag_data = {
  filter_cache: new Set(),
  filter_cache_is_valid: false,
  liked: new Set(),
  disabled: new Set(),
};
yp.tag_data = tag_data;



Set.prototype.every = function( condition ) {
  for( let v of this ) {
    if( !condition(v) ) {
      return false;
    }
  }
  return true;
};

Set.prototype.some = function( condition ) {
  let not_conditon = (x) => !condition(x);
  return !this.every(not_conditon);
}

tag_data.require = new Set();
tag_data.exclude = new Set();
tag_data.include = new Set();
tag_data.ignore  = new Set();

tag_data.should_play = function(song) {
  //annoyingly need to bind this function to use in every and some
  const song_has = song.info.tags.has.bind(song.info.tags);
  //make sure all required tags are in the song's tag list
  if(! tag_data.require.every( song_has ) ) {
    return false;
  }
  //make sure no excluded tags are in the song's tag list
  if( tag_data.exclude.some( song_has ) ) {
    return false;
  }
  let found_include_tag = false;
  song.info.tags.forEach( function(tag) {
    if(tag_data.include.has(tag) || tag_data.require.has(tag)) {
      found_include_tag = true;
    }
  });
  return found_include_tag;
};

//return the list of indices of allowed songs
tag_data.filtered_set = function() {
  if(tag_data.filter_cache_is_valid) {
    return tag_data.filter_cache;
  }
  else if(yp.song_data) {
    tag_data.filter_cache = new Set(yp.song_data.filter(tag_data.should_play).map( (song) => song.index ));
    tag_data.filter_cache_is_valid = true;
    return tag_data.filter_cache;
  }
  else {
    tag_data.filter_cache_is_valid = false;
    return new Set();
  }
};

const tag_order = [
  'Anime',
  'Video Game',
  'Idol',
  'Vocaloid',
  'J-Pop',
  'Chiptune',
  'Visual Novel',
  'Rhythm Game',
  'Multiple Versions',
  'Other',
  'Character Song',
  'Remix',
  'Short',
  'Long',
  'Muted',
  ];
//maps data property name to displayed tag name
const custom_tags = {
  liked: 'Liked',
  disabled: 'Disabled',
};

let add_tag_row = function(tag_name) {
  const table = document.getElementById('inner-tag-table');
  const template = document.getElementById('tag-table-row-template');
  const row = template.cloneNode(true); //pass true to do a deep copy
  row.id = 'tag-row-' + tag_name;

  let order_val = tag_order.indexOf(tag_name);
  if(order_val == -1) {
    order_val = tag_order.length;
  }
  row.style.order = order_val;

  const local_storage_id = "tag-" + tag_name;
  let saved_value = namedstore.getItem(local_storage_id);

  let previous_value = "include";
  if(saved_value) {
    previous_value = saved_value;
  }
  else {
    saved_value = previous_value;
    namedstore.setItem(local_storage_id, "include");
  }
  tag_data[previous_value].add(tag_name);
  let onclick = function() {
    const my_value = this.value;
    //if the radio button option changed
    if(previous_value !== my_value) {
      //update tag sets
      tag_data[my_value].add(tag_name);
      tag_data[previous_value].delete(tag_name);
      //update previous
      previous_value = my_value;
      //invalidate filtered list cache
      tag_data.filter_cache_is_valid = false;
      //update namedstore
      namedstore.setItem(local_storage_id, my_value);
    }
  };

  row.getElementsByTagName('label')[0].innerHTML = tag_name;
  for( let input of Array.from(row.getElementsByTagName('input')) ) {
    input.name = "tag-option-" + tag_name;
    input.onclick = onclick;
    if(saved_value === input.value) {
      input.checked = "checked";
    }
  }

  table.appendChild(row);
};

let clear_table = function() {
  const table = document.getElementById('inner-tag-table');
  table.innerHTML = "";
}

//handler for a tag preference checkbox
tag_data.tag_preference_checkbox = function(prop_name) {
  const tag_name = custom_tags[prop_name];
  return function() {
    if(!yp.player) {
      return;
    }
    //get the currently playing song
    const song_index = yp.player.cur_song;
    if(song_index >= 0) {
      const uuid = yp.song_data[song_index].info.uuid;
      //add or remove the song from the set having this custom tag
      if(this.checked) {
        tag_data[prop_name].add(uuid);
        yp.song_data[song_index].info.tags.add(tag_name);
      }
      else {
        tag_data[prop_name].delete(uuid);
        yp.song_data[song_index].info.tags.delete(tag_name);
      }
      namedstore.setItem( prop_name, JSON.stringify(Array.from(tag_data[prop_name])) );
    }
  };
};

tag_data.reset_tag_preferences = function() {
  for(let prop_name in custom_tags) {
    const tag_name = custom_tags[prop_name];
    //remove the tags from each song that has them
    tag_data[prop_name].forEach( (uuid) => yp.song_data[ yp.uuid_to_index[uuid] ].info.tags.delete(tag_name) );
    //remove the preferences from storage
    tag_data[prop_name] = new Set();
    namedstore.setItem( prop_name, JSON.stringify([]) );
  }
  tag_data.filter_cache_is_valid = false;
};

tag_data.reset_set_tags = function() {
  //set all tag options to include
  yp.tags.forEach( function(tag_name) {
    //reset radio button
    const row = document.getElementById('tag-row-' + tag_name);
    for( let input of Array.from(row.getElementsByTagName('input')) ) {
      if("include" === input.value) {
        input.click();
      }
    }
  });
  tag_data.filter_cache_is_valid = false;
};

return function() {
  //read in liked and disabled sets
  for(let prop_name in custom_tags) {
    //pull from namedstore
    const stored_prop = namedstore.getItem(prop_name);
    if(stored_prop) {
      tag_data[prop_name] = new Set( JSON.parse(stored_prop) );
    }
    else {
      namedstore.setItem( prop_name, JSON.stringify([]) );
    }
    //add tags to the songs that have them
    const tag_name = custom_tags[prop_name];
    tag_data[prop_name].forEach( (uuid) => yp.song_data[ yp.uuid_to_index[uuid] ].info.tags.add(tag_name) );
  }

  clear_table();
  //clear the tag options
  tag_data.require = new Set();
  tag_data.exclude = new Set();
  tag_data.include = new Set();
  tag_data.ignore  = new Set();
  //add in the custom tags
  Object.keys(custom_tags).forEach( (prop_name) => yp.tags.add(custom_tags[prop_name]) );
  //build the table, set the options to saved values
  yp.tags.forEach( add_tag_row );
};

};
