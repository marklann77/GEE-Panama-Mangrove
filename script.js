/*
  Title: Panama Mangrove Monitor
  Author: Mark Lannaman
  Date: January 2026
  Description: Mangrove change app with dynamic province selection, 
               masked analysis lenses, and a functional time-slider.
*/

////// 1. UI & LAYOUT //////
var invertedBasemap = [{featureType: 'all', stylers: [{invert_lightness: true}]}];
Map.setOptions('invertedBasemap', {'invertedbasemap': invertedBasemap});

var sidebar = ui.Panel({style: {width: '350px', padding: '10px', backgroundColor: '#333333', border: '2px solid #555555'}});
var sidebar2 = ui.Panel({style: {width: '150px', padding: '10px', backgroundColor: '#333333', border: '2px solid #555555'}});
ui.root.insert(0, sidebar);
ui.root.add(sidebar2);

sidebar.add(ui.Label('Panama Mangrove Monitor', {fontSize: '24px', color: 'white', backgroundColor: '#333333', fontWeight: 'bold'}));
sidebar.add(ui.Label('Tracking mangrove density over time. Baseline (2000) uses Landsat Mangrove Forests.', {color: 'white', backgroundColor: '#333333'}));

////// 2. DATA & GEOMETRY //////
var panama = ee.FeatureCollection("USDOS/LSIB_SIMPLE/2017").filter(ee.Filter.eq('country_na', 'Panama'));
Map.centerObject(panama, 7);

var provinces = ee.FeatureCollection("FAO/GAUL/2015/level1").filter(ee.Filter.eq('ADM0_NAME', 'Panama'));
var borderStyle = {color: '#FFBF00', width: 1, fillColor: '00000000'};

// Baseline Mangroves (2000)
var mangroves = ee.ImageCollection("LANDSAT/MANGROVE_FORESTS");
var filtered_mangroves = mangroves.mosaic().clip(panama);

// Landsat 8 for Analysis & Charting
var l8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2").filterBounds(panama);
var landsat2024 = l8.filterDate('2024-01-01', '2024-12-31').median().clip(panama);

var addNDVI = function(image) {
  var ndvi = image.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI');
  return image.addBands(ndvi);
};
var l8_ndvi = l8.filterDate('2020-01-01', '2024-12-31').map(addNDVI);

////// 3. THE MASTER LAYER STACK //////
var highlightLayer = ui.Map.Layer(ee.Image(), {}, 'Selected Province Highlight');
Map.layers().set(0, highlightLayer);

var analysisLayer = ui.Map.Layer(ee.Image(), {}, 'Active Analysis');
Map.layers().set(1, analysisLayer);

Map.layers().set(2, ui.Map.Layer(filtered_mangroves, {palette: ['#52cc00']}, 'Baseline Mangroves (2000)'));
Map.layers().set(3, ui.Map.Layer(panama.style(borderStyle), {}, 'Panama Border'));

////// 4. INTERACTIVE WIDGETS //////

// Create the Year Label
var yearLabel = ui.Label({
  value: 'Year: 2024', 
  style: {
    fontSize: '20px',
    fontWeight: 'bold',
    position: 'top-right',
    color: '#FFBF00',      
    backgroundColor: '#00000000' // Fixed hex code
  }
});
Map.add(yearLabel);

// Date Slider
var DateSlider = ui.DateSlider({
  start: '2013-01-01', 
  end: '2024-12-31',
  value: '2024-01-01',
  period: 365,
  style: {width: '95%', backgroundColor: '#ffffff'}
});
sidebar.add(DateSlider);

DateSlider.onChange(function(range) {
  var selectedDate = range.start();
  var year = selectedDate.get('year');
  
  // Update the on-map Label
  year.evaluate(function(yearNumber) {
    yearLabel.setValue('Year: ' + yearNumber);
  });
  
  var start = ee.Date.fromYMD(year, 1, 1);
  var end = start.advance(1, 'year');
  var yearImage = l8.filterDate(start, end).median().clip(panama);
  var maskedYear = yearImage.updateMask(filtered_mangroves);
  var vis = {bands: ['SR_B5', 'SR_B4', 'SR_B3'], min: 0, max: 25000};
  
  Map.layers().set(1, ui.Map.Layer(maskedYear, vis, 'Landsat Year: ' + year.getInfo()));
});

// Province Dropdown
var provinceList = provinces.aggregate_array('ADM1_NAME').sort();
var provinceSelector = ui.Select({
  items: provinceList.getInfo(),
  placeholder: 'Select a Province...',
  onChange: function(name) {
    var selectedProvince = provinces.filter(ee.Filter.eq('ADM1_NAME', name));
    Map.centerObject(selectedProvince, 9);
    var highlightStyle = {color: '#FFBF00', width: 2, fillColor: 'ffffff44'};
    highlightLayer.setEeObject(selectedProvince.style(highlightStyle));
  },
  style: {width: '95%'}
});
sidebar.add(provinceSelector);

// Charting
var chart = ui.Chart.image.series({
  imageCollection: l8_ndvi.select('NDVI'),
  region: panama,
  reducer: ee.Reducer.mean(),
  scale: 1000,
  xProperty: 'system:time_start'
}).setOptions({
  title: 'NDVI (Greenness) Trend',
  vAxis: {title: 'NDVI'},
  hAxis: {title: 'Year'},
  series: {0: {color: '#52cc00'}},
  backgroundColor: '#333333',
  titleTextStyle: {color: 'white'},
  legend: {position: 'none'}
});
sidebar.add(chart);

////// 5. ANALYSIS BUTTONS //////
var makeButton = function(label, bands, max, name) {
  var btn = ui.Button(label);
  btn.onClick(function() {
    var maskedLandsat = landsat2024.updateMask(filtered_mangroves);
    var vis = {bands: bands, min: 0, max: max};
    Map.layers().set(1, ui.Map.Layer(maskedLandsat, vis, name));
  });
  sidebar2.add(btn);
};

makeButton('Natural Color', ['SR_B4', 'SR_B3', 'SR_B2'], 20000, 'Natural Color');
makeButton('False Color IR', ['SR_B5', 'SR_B4', 'SR_B3'], 25000, 'False Color IR');
makeButton('Shortwave IR', ['SR_B7', 'SR_B6', 'SR_B4'], 20000, 'Shortwave IR');
makeButton('Veg Analysis', ['SR_B6', 'SR_B5', 'SR_B4'], 25000, 'Vegetation Analysis');

/*
-----------------------------------------------
Other RGB combinations:
//Natural colour: 4 3 2
//False colour infrared: 8 4 3
//False colour urban: 12 11 4
//Agriculture: 11 8 2
//Atmospheric penetration: 12 11 8A
//Healthy vegetation: 8 11 2
//Land/Water: 8 11 4
//Natural colours with atmospheric removal: 12 8 3
//Shortwave infrared: 12 8 4
//Vegetation analysis: 11 8 4
-----------------------------------------------
*/
