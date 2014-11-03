/*

  ## Timepicker2

  ### Parameters
  * mode :: The default mode of the panel. Options: 'relative', 'absolute' 'since' Default: 'relative'
  * time_options :: An array of possible time options. Default: ['5m','15m','1h','6h','12h','24h','2d','7d','30d']
  * timespan :: The default options selected for the relative view. Default: '15m'
  * timefield :: The field in which time is stored in the document.
  * refresh: Object containing refresh parameters
    * enable :: true/false, enable auto refresh by default. Default: false
    * interval :: Seconds between auto refresh. Default: 30
    * min :: The lowest interval a user may set
*/
define([
  'angular',
  'app',
  'lodash',
  'moment',
  'kbn'
],
function (angular, app, _, moment, kbn) {
  'use strict';

  var module = angular.module('kibana.panels.timepicker', []);
  app.useModule(module);

  module.controller('timepicker', function($scope, $modal, $q,dashboard,filterSrv,kbnIndex) {
    $scope.panelMeta = {
      status  : "Stable",
      description : "A panel for controlling the time range filters. If you have time based data, "+
        " or if you're using time stamped indices, you need one of these"
    };


    // Set and populate defaults
    var _d = {
      status        : "Stable",
      time_options  : ['5m','15m','1h','6h','12h','24h','2d','7d','30d'],
      refresh_intervals : ['5s','10s','30s','1m','5m','15m','30m','1h','2h','1d'],

      timefield     : '@timestamp'
    };
    _.defaults($scope.panel,_d);

    var customTimeModal = $modal({
      template: './app/panels/timepicker/custom.html',
      persist: true,
      show: false,
      scope: $scope,
      keyboard: false
    });

    $scope.filterSrv = filterSrv;

    // ng-pattern regexs
    $scope.patterns = {
      date: /^[0-9]{2}\/[0-9]{2}\/[0-9]{4}$/,
      hour: /^([01]?[0-9]|2[0-3])$/,
      minute: /^[0-5][0-9]$/,
      second: /^[0-5][0-9]$/,
      millisecond: /^[0-9]*$/
    };

    $scope.$on('refresh', function(){$scope.init();});

    $scope.init = function() {
      var time = filterSrv.timeRange('last');
      if(time) {
        $scope.panel.now = filterSrv.timeRange(false).to === "now" ? true : false;
        $scope.time = getScopeTimeObj(time.from,time.to);
      }
    };

    $scope.set_selected_customer=function(){
        $scope.get_existing_nodes_for_customer();
     };

     $scope.update_date_range=function(){
         var range;
         var selected_nodes =_.pluck(_.select($scope.existing_nodes, "selected"), 'name');
         if(_.isEmpty(selected_nodes) || _.contains(selected_nodes,kbnIndex.get_all_const())){
             range=kbnIndex.indexStartEndTime($scope.selected_customer);
         }else{
             range=kbnIndex.indexStartEndTimeOfNodes($scope.selected_customer,selected_nodes);
         }
         $scope.temptime =
             getScopeTimeObj(range[0],range[1]);

         //Date picker needs the date to be at the start of the day
         $scope.temptime.from.date.setHours(0,0,0,0);
         $scope.temptime.to.date.setHours(0,0,0,0);

         // This is an ugly hack, but works.
         if(new Date().getTimezoneOffset() < 0) {
             $scope.temptime.from.date = moment($scope.temptime.from.date).add('days',1).toDate();
             $scope.temptime.to.date = moment($scope.temptime.to.date).add('days',1).toDate();
         }

         $scope.panel.now=false;

     };

     $scope.get_existing_nodes_for_customer=function(){
         var nodes=kbnIndex.get_nodes($scope.selected_customer);
         $scope.existing_nodes= _.map(nodes,function(n){
             return {
                 "name":n,
                 "selected":false
             }
         });

         $scope.show_in_rows=1;
         $scope.rows_options=[];
         var i=1;
         _.each($scope.existing_nodes,function(v){
             $scope.rows_options.push(i++);
         });
     }

    $scope.customTime = function() {
      // Assume the form is valid since we're setting it to something valid
      $scope.input.$setValidity("dummy", true);
      if(_.isEmpty($scope.temptime)) {
          var range=kbnIndex.indexStartEndTime($scope.selected_customer);
          $scope.temptime =getScopeTimeObj(range[0],range[1]);
      }

      $scope.existing_customers=kbnIndex.get_existing_customers();
      if(_.isEmpty($scope.selected_customer)) {
          $scope.selected_customer = $scope.existing_customers[0];
          $scope.set_selected_customer();
      }

      $q.when(customTimeModal).then(function(modalEl) {
        modalEl.modal('show');
      });
    };

    // Constantly validate the input of the fields. This function does not change any date variables
    // outside of its own scope
    $scope.validate = function(time) {
      // Assume the form is valid. There is a hidden dummy input for invalidating it programatically.
      $scope.input.$setValidity("dummy", true);

      var _from = datepickerToLocal(time.from.date),
        _to = datepickerToLocal(time.to.date),
        _t = time;

      if($scope.input.$valid) {

        _from.setHours(_t.from.hour,_t.from.minute,_t.from.second,_t.from.millisecond);
        _to.setHours(_t.to.hour,_t.to.minute,_t.to.second,_t.to.millisecond);

        // Check that the objects are valid and to is after from
        if(isNaN(_from.getTime()) || isNaN(_to.getTime()) || _from.getTime() >= _to.getTime()) {
          $scope.input.$setValidity("dummy", false);
          return false;
        }
      } else {
        return false;
      }

      return {from:_from,to:_to};
    };

    $scope.setNow = function() {
      $scope.time.to = getTimeObj(new Date());
    };


    /*
      time : {
        from: Date
        to: Date
      }
    */
    $scope.setAbsoluteTimeFilter = function () {

      var time=$scope.validate($scope.temptime);
      // Create filter object
      var _filter = _.clone(time);

      _filter.type = 'time';
      _filter.field = $scope.panel.timefield;

      if($scope.panel.now) {
        _filter.to = "now";
      }

      // Clear all time filters, set a new one
      filterSrv.removeByType('time',true);
      $scope.time = getScopeTimeObj(time.from,time.to);
      kbnIndex.set_selected_customer($scope.selected_customer);
      $scope.panel.filter_id = filterSrv.set(_filter);

      var selected_nodes =_.pluck(_.select($scope.existing_nodes, "selected"), 'name');
      create_panels_for_nodes(selected_nodes);

      return $scope.panel.filter_id;
    };

    function create_panels_for_nodes(nodes){
          if(_.isEmpty(nodes)){
              return;
          }

          var rows=dashboard.current.rows;

          var row, panel;
        _.find(rows, function(r){
            if (_.isEmpty(r.panels)){
                return;
            }

            panel=_.find(r.panels,function(p){
                 return p.type==="histogram";
            });

            if(!_.isEmpty(panel)){
                row=r;
                return;
            }
        });

        if(_.isEmpty(panel)){
            row=rows[0];
            row.panels=[];
            //copied from logstash.json
            panel={
                "span": 12,
                "editable": true,
                "group": [
                    "default"
                ],
                "type": "histogram",
                "mode": "aggregate",
                "time_field": "@timestamp",
                "value_field": "event",
                "auto_int": true,
                "resolution": 100,
                "interval": "10m",
                "fill": 3,
                "linewidth": 3,
                "timezone": "browser",
                "spyable": true,
                "zoomlinks": true,
                "bars": true,
                "stack": true,
                "points": false,
                "lines": false,
                "legend": true,
                "x-axis": true,
                "y-axis": true,
                "percentage": false,
                "interactive": true,
                "queries": {
                    "mode": "all",
                    "ids": [
                        0
                    ]
                },
                "title": "Events over time",
                "intervals": [
                    "auto",
                    "1s",
                    "1m",
                    "5m",
                    "10m",
                    "30m",
                    "1h",
                    "3h",
                    "12h",
                    "1d",
                    "1w",
                    "1M",
                    "1y"
                ],
                "options": true,
                "tooltip": {
                    "value_type": "cumulative",
                    "query_as_alias": false
                }
            }
            row.panels.push(panel);
        };

        if(nodes.length<row.panels.length){
            row.panels.splice(nodes.length);
        }

        var span=12;
        if($scope.show_in_rows!=nodes.length){
            var nodes_in_one_row=Math.round(nodes.length/$scope.show_in_rows);
            span=Math.floor(12/nodes_in_one_row);
        }

        var i=0;
        _.each(row.panels,function(p){
            p.node=nodes[i++];
            p.span=span;
        });
         _.each(nodes.slice(i),function(n){
                 var cp= angular.copy(panel);
                 cp.node=n;
                 cp.span=span;
                 row.panels.push(cp);
                }
            );
        };



    $scope.setRelativeFilter = function(timespan) {

      $scope.panel.now = true;
      // Create filter object
      var _filter = {
        type : 'time',
        field : $scope.panel.timefield,
        from : "now-"+timespan,
        to: "now"
      };

      // Clear all time filters, set a new one
      filterSrv.removeByType('time',true);

      // Set the filter
      $scope.panel.filter_id = filterSrv.set(_filter);

      // Update our representation
      $scope.time = getScopeTimeObj(kbn.parseDate(_filter.from),new Date());

      return $scope.panel.filter_id;
    };

    var pad = function(n, width, z) {
      z = z || '0';
      n = n + '';
      return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
    };

    var cloneTime = function(time) {
      var _n = {
        from: _.clone(time.from),
        to: _.clone(time.to)
      };
      // Create new dates as _.clone is shallow.
      _n.from.date = new Date(_n.from.date);
      _n.to.date = new Date(_n.to.date);
      return _n;
    };

    var getScopeTimeObj = function(from,to) {
      return {
        from: getTimeObj(from),
        to: getTimeObj(to)
      };
    };

    var getTimeObj = function(date) {
      return {
        date: new Date(date),
        hour: pad(date.getHours(),2),
        minute: pad(date.getMinutes(),2),
        second: pad(date.getSeconds(),2),
        millisecond: pad(date.getMilliseconds(),3)
      };
    };

    // Do not use the results of this function unless you plan to use setHour/Minutes/etc on the result
    var datepickerToLocal = function(date) {
      date = moment(date).clone().toDate();
      return moment(new Date(date.getTime() + date.getTimezoneOffset() * 60000)).toDate();
    };


  });
});
