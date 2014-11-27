/** @scratch /panels/5
 *
 * include::panels/histogram.asciidoc[]
 */

/** @scratch /panels/histogram/0
 *
 * == Histogram
 * Status: *Stable*
 *
 * The histogram panel allow for the display of time charts. It includes several modes and tranformations
 * to display event counts, mean, min, max and total of numeric fields, and derivatives of counter
 * fields.
 *
 */
define([
  'angular',
  'app',
  'jquery',
  'lodash',
  'kbn',
  'moment',
  './timeSeries',
  'numeral',
  'jquery.flot',
  'jquery.flot.events',
  'jquery.flot.selection',
  'jquery.flot.time',
  'jquery.flot.byte',
  'jquery.flot.stack',
  'jquery.flot.stackpercent'
],
function (angular, app, $, _, kbn, moment, timeSeries, numeral) {

  'use strict';

  var module = angular.module('kibana.panels.histogram', []);
  app.useModule(module);

  module.controller('histogram', function($scope, $q, querySrv, dashboard, filterSrv,kbnIndex,fields,json2csv) {
    $scope.panelMeta = {
      modals : [
        {
          description: "Inspect",
          icon: "icon-info-sign",
          partial: "app/partials/inspector.html",
          show: $scope.panel.spyable
        },
          {
              description: "Csv",
              icon: "icon-table",
              partial: "app/partials/csv.html",
              show: true,
              click: function() {
                  $scope.get_downloadable_fields();
              }
          }
      ],
      editorTabs : [
        {
          title:'Style',
          src:'app/panels/histogram/styleEditor.html'
        },
        {
          title:'Queries',
          src:'app/panels/histogram/queriesEditor.html'
        }
      ],
      status  : "Stable",
      description : "A bucketed time series chart of the current query or queries. Uses the "+
        "Elasticsearch date_histogram facet. If using time stamped indices this panel will query"+
        " them sequentially to attempt to apply the lighest possible load to your Elasticsearch cluster"
    };

    // Set and populate defaults
    var _d = {
      /** @scratch /panels/histogram/3
       *
       * === Parameters
       * ==== Axis options
       * mode:: Value to use for the y-axis. For all modes other than count, +value_field+ must be
       * defined. Possible values: count, mean, max, min, total.
       */
      mode          : 'count',
      /** @scratch /panels/histogram/3
       * time_field:: x-axis field. This must be defined as a date type in Elasticsearch.
       */
      timefield    : '@timestamp',
      /** @scratch /panels/histogram/3
       * value_field:: y-axis field if +mode+ is set to mean, max, min or total. Must be numeric.
       */
      value_field   : null,
      /** @scratch /panels/histogram/3
       * x-axis:: Show the x-axis
       */
      'x-axis'      : true,
      /** @scratch /panels/histogram/3
       * y-axis:: Show the y-axis
       */
      'y-axis'      : true,
      /** @scratch /panels/histogram/3
       * scale:: Scale the y-axis by this factor
       */
      scale         : 1,
      /** @scratch /panels/histogram/3
       * y_format:: 'none','bytes','short '
       */
      y_format    : 'none',
      /** @scratch /panels/histogram/5
       * grid object:: Min and max y-axis values
       * grid.min::: Minimum y-axis value
       * grid.max::: Maximum y-axis value
       */
      grid          : {
        max: null,
        min: 0
      },
      /** @scratch /panels/histogram/5
       *
       * ==== Queries
       * queries object:: This object describes the queries to use on this panel.
       * queries.mode::: Of the queries available, which to use. Options: +all, pinned, unpinned, selected+
       * queries.ids::: In +selected+ mode, which query ids are selected.
       */
      queries     : {
        mode        : 'all',
        ids         : []
      },
      /** @scratch /panels/histogram/3
       *
       * ==== Annotations
       * annotate object:: A query can be specified, the results of which will be displayed as markers on
       * the chart. For example, for noting code deploys.
       * annotate.enable::: Should annotations, aka markers, be shown?
       * annotate.query::: Lucene query_string syntax query to use for markers.
       * annotate.size::: Max number of markers to show
       * annotate.field::: Field from documents to show
       * annotate.sort::: Sort array in format [field,order], For example [`@timestamp',`desc']
       */
      annotate      : {
        enable      : false,
        query       : "*",
        size        : 20,
        field       : '_type',
        sort        : ['_score','desc']
      },
      /** @scratch /panels/histogram/3
       * ==== Interval options
       * auto_int:: Automatically scale intervals?
       */
      auto_int      : true,
      /** @scratch /panels/histogram/3
       * resolution:: If auto_int is true, shoot for this many bars.
       */
      resolution    : 100,
      /** @scratch /panels/histogram/3
       * interval:: If auto_int is set to false, use this as the interval.
       */
      interval      : '5m',
      /** @scratch /panels/histogram/3
       * interval:: Array of possible intervals in the *View* selector. Example [`auto',`1s',`5m',`3h']
       */
      refresh_intervals     : ['auto','1s','1m','5m','10m','30m','1h','3h','12h','1d','1w','1y'],
      /** @scratch /panels/histogram/3
       * ==== Drawing options
       * lines:: Show line chart
       */
      lines         : false,
      /** @scratch /panels/histogram/3
       * fill:: Area fill factor for line charts, 1-10
       */
      fill          : 0,
      /** @scratch /panels/histogram/3
       * linewidth:: Weight of lines in pixels
       */
      linewidth     : 3,
      /** @scratch /panels/histogram/3
       * points:: Show points on chart
       */
      points        : false,
      /** @scratch /panels/histogram/3
       * pointradius:: Size of points in pixels
       */
      pointradius   : 5,
      /** @scratch /panels/histogram/3
       * bars:: Show bars on chart
       */
      bars          : true,
      /** @scratch /panels/histogram/3
       * stack:: Stack multiple series
       */
      stack         : true,
      /** @scratch /panels/histogram/3
       * spyable:: Show inspect icon
       */
      spyable       : true,
      /** @scratch /panels/histogram/3
       * zoomlinks:: Show `Zoom Out' link
       */
      zoomlinks     : true,
      /** @scratch /panels/histogram/3
       * options:: Show quick view options section
       */
      options       : true,
      /** @scratch /panels/histogram/3
       * legend:: Display the legond
       */
      legend        : true,
      /** @scratch /panels/histogram/3
       * show_query:: If no alias is set, should the query be displayed?
       */
      show_query    : true,
      /** @scratch /panels/histogram/3
       * interactive:: Enable click-and-drag to zoom functionality
       */
      interactive   : true,
      /** @scratch /panels/histogram/3
       * legend_counts:: Show counts in legend
       */
      legend_counts : true,
      /** @scratch /panels/histogram/3
       * ==== Transformations
       * timezone:: Correct for browser timezone?. Valid values: browser, utc
       */
      timezone      : 'browser', // browser or utc
      /** @scratch /panels/histogram/3
       * percentage:: Show the y-axis as a percentage of the axis total. Only makes sense for multiple
       * queries
       */
      percentage    : false,
      /** @scratch /panels/histogram/3
       * zerofill:: Improves the accuracy of line charts at a small performance cost.
       */
      zerofill      : true,
      /** @scratch /panels/histogram/3
       * derivative:: Show each point on the x-axis as the change from the previous point
       */

      derivative    : false,
      /** @scratch /panels/histogram/3
       * tooltip object::
       * tooltip.value_type::: Individual or cumulative controls how tooltips are display on stacked charts
       * tooltip.query_as_alias::: If no alias is set, should the query be displayed?
       */
      tooltip       : {
        value_type: 'cumulative',
        query_as_alias: true
      }
    };

    _.defaults($scope.panel,_d);
    _.defaults($scope.panel.tooltip,_d.tooltip);
    _.defaults($scope.panel.annotate,_d.annotate);
    _.defaults($scope.panel.grid,_d.grid);
    //configs in logstash.json trumps configs inside js
    _.assign($scope.panel,dashboard.getTimeOptionDefault());

      $scope.$on('timeOptions', function (event, data) {
          _.assign($scope.panel,data);
      });

    $scope.init = function() {
      // Hide view options by default
      $scope.options = false;

      // Always show the query if an alias isn't set. Users can set an alias if the query is too
      // long
      $scope.panel.tooltip.query_as_alias = true;
      $scope.get_existing_nodes();
      $scope.get_data();

    };

    $scope.get_existing_nodes=function(){
        $scope.existing_nodes=kbnIndex.get_nodes(kbnIndex.get_selected_customer());
        if(_.isEmpty($scope.panel.node) || !_.contains($scope.existing_nodes,$scope.panel.node) ) {
            $scope.panel.node = $scope.existing_nodes[0];
        }

    }
      //TODO: html can access fields.list, i think it is defined in dash.js as a globle variable,
      //however in directive/control, can't access fields.list, has to drop in the fields service
      //why?
      $scope.get_downloadable_fields=function(){
          if(!_.isEmpty($scope.panel.download.fields)){
              return;
          }
          _.map(fields.list,function(f) {
              if (string_ends_with(f, ".raw") ){
                  return;
              }

              //TODO: where does geoip come from?
              if(_.isEqual(f,'geoip') || _.isEqual(f,'geoip.location') || _.isEqual(f,"@version")){
                  return;
              }
              $scope.panel.download.fields.push({"name":f,"selected":false});
          });
      };

      $scope.download_cvs=function(){
          var filename=kbnIndex.get_selected_customer()+"-"+ $scope.panel.node+".csv";
          if($scope.panel.download.mode==='Result'){
              var jsons=[];
              _.each(this.plotdataset,function(d1){
                  var event=d1.label;
                  _.each(d1.data,function(d2){
                      var json={};
                      json.time= moment(d2[0]).format('YYYY-MM-DDTHH:mm:ss');
                      json.count=d2[1];
                      json.event=event;
                      jsons.push(json);
                  });
              });
              json2csv.json2csv({data:jsons,sortby:"@timestamp"},filename);
          }else{
              var deferred=$q.defer();
              $scope.get_raw_data(deferred);

              var fields=_.pluck(_.select($scope.panel.download.fields, "selected"), 'name');
              deferred.promise.then(function (result){
                  json2csv.json2csv({data:result,
                                    sortby:"@timestamp",
                                    fields:fields},filename);
          });

      }

    };

    $scope.set_interval = function(interval) {
      if(interval !== 'auto') {
        $scope.panel.auto_int = false;
        $scope.panel.interval = interval;
      } else {
        $scope.panel.auto_int = true;
      }
    };

    $scope.interval_label = function(interval) {
      return $scope.panel.auto_int && interval === $scope.panel.interval ? interval+" (auto)" : interval;
    };

    /**
     * The time range effecting the panel
     * @return {[type]} [description]
     */
    $scope.get_time_range = function () {
      var range = $scope.range = filterSrv.timeRange('last');
      return range;
    };

    $scope.get_interval = function () {
      var interval = $scope.panel.interval,
                      range;
      if ($scope.panel.auto_int) {
        range = $scope.get_time_range();
        if (range) {
          interval = kbn.secondsToHms(
            kbn.calculate_interval(range.from, range.to, $scope.panel.resolution, 0) / 1000
          );
        }
      }
      $scope.panel.interval = interval || '10m';
      return $scope.panel.interval;
    };

  var selectedIndices;
  var getIndices=function(deferred){
      if(!_.isEmpty(selectedIndices)){
          deferred.resolve(selectedIndices);
          return;
          //return $q.when(selecteIndices);
      }

      var _range = filterSrv.timeRange('last');
      return kbnIndex.indices(_range.from,_range.to,
          dashboard.current.index.pattern,dashboard.current.index.interval,
          $scope.panel.node).then(function(r){
              selectedIndices=r;
              deferred.resolve(selectedIndices);
          //return  $q.when(selecteIndices);
      });

  };

   function string_ends_with(str,suffix) {
      var reguex= new RegExp(suffix+'$');

      if (str.match(reguex)!=null)
          return true;

      return false;
   }

   $scope.get_raw_data = function(deferred, jsons, segment, query_id) {
          var
              _range,
              _interval,
              request,
              boolQuery,
              queries,
              results;

          if (_.isUndefined(segment)) {
              segment = 0;
          }
          delete $scope.panel.error;

       var indiceDeferred=$q.defer();
       getIndices(indiceDeferred);

       indiceDeferred.promise.then(function (indices) {

              // Make sure we have everything for the request to complete
              if(indices.length === 0) {
                  return;
              }
              _range = $scope.get_time_range();
              _interval = $scope.get_interval(_range);
              request = $scope.ejs.Request().indices(indices[segment]);

              $scope.panel.queries.ids = querySrv.idsByMode($scope.panel.queries);

              queries = querySrv.getQueryObjs($scope.panel.queries.ids);

              boolQuery = $scope.ejs.BoolQuery();
              _.each(queries,function(q) {
                  boolQuery = boolQuery.should(querySrv.toEjsObj(q));
              });

              request = request.query(
                  $scope.ejs.FilteredQuery(
                      boolQuery,
                      filterSrv.getBoolFilter(filterSrv.ids())
                  ));

              results = request.doSearchScroll();

              results.then(function(r){
                  if(segment === 0) {
                      jsons=[];
                      query_id = $scope.query_id = new Date().getTime();
                  }

                  if(!(_.isUndefined(r.error))) {
                      $scope.panel.error = $scope.parse_error(r.error);
                      //TODO: exit the whole thing upon errors?
                      deferred.resolve([]);
                  }else{
                     var assemble_result=function(r0){
                         _.each(r0.hits.hits,function(hit){
                             jsons.push(hit._source);
                         });
                     };

                     var scroll_deferred = $q.defer();
                     request.doScrollUntil(r._scroll_id,assemble_result,scroll_deferred);
                     scroll_deferred.promise.then(function(r){
                         if(segment < indices.length-1) {
                                $scope.get_raw_data(deferred,jsons, segment+1,query_id);
                         }else{
                            deferred.resolve(jsons);
                         }
                     });
                  }
              });
          });
      };

    $scope.get_data = function(term_map, segment, query_id) {
      var
        _range,
        _interval,
        request,
        boolQuery,
        queries,
        results;

      if (_.isUndefined(segment)) {
        segment = 0;
      }
      delete $scope.panel.error;

      var deferred=$q.defer();
      getIndices(deferred);

      deferred.promise.then(function (indices) {
          if(_.isEmpty(indices)){
              return;
          }
          _range = $scope.get_time_range();
          _interval = $scope.get_interval(_range);

          if ($scope.panel.auto_int) {
              $scope.panel.interval = kbn.secondsToHms(
                  kbn.calculate_interval(_range.from, _range.to, $scope.panel.resolution, 0) / 1000);
          }

          $scope.panelMeta.loading = true;
          request = $scope.ejs.Request().indices(indices[segment]);
          if (!$scope.panel.annotate.enable) {
              request.searchType("count");
          }

          //TODO: where does $scope.panel.queries come from?
          $scope.panel.queries.ids = querySrv.idsByMode($scope.panel.queries);

          queries = querySrv.getQueryObjs($scope.panel.queries.ids);

          boolQuery = $scope.ejs.BoolQuery();
          _.each(queries, function (q) {
              boolQuery = boolQuery.should(querySrv.toEjsObj(q));
          });

          var histogram = $scope.ejs.DateHistogramAggregation(0);
          histogram.field($scope.panel.timefield);

          //the second level aggregation
          if (!_.isEqual($scope.panel.mode, 'count')) {
              var value_field = $scope.panel.value_field;
              //by default, terms aggregation only returns the top 10
              var nestedAgg = $scope.ejs.TermsAggregation(1).size(200);
              nestedAgg.field(value_field);
              histogram.agg(nestedAgg);

              //the third level
              if (!_.isEmpty($scope.panel.agg2)) {
                  //by default, terms aggregation only returns the top 10
                  var nestedAgg2 = $scope.ejs.TermsAggregation(2).size(200);
                  nestedAgg2.field($scope.panel.agg2);
                  nestedAgg.agg(nestedAgg2);
              }
          }

          histogram.interval(_interval);
          request = request.query(
              $scope.ejs.FilteredQuery(
                  boolQuery,
                  filterSrv.getBoolFilter(filterSrv.ids())
              ));
          request = request.aggregation(histogram)
              .size($scope.panel.annotate.enable ? $scope.panel.annotate.size : 0);

          if ($scope.panel.annotate.enable) {
              var query = $scope.ejs.FilteredQuery(
                  $scope.ejs.QueryStringQuery($scope.panel.annotate.query || '*'),
                  filterSrv.getBoolFilter(filterSrv.idsByType('time'))
              );
              request = request.query(query);

              // This is a hack proposed by @boaz to work around the fact that we can't get
              // to field data values directly, and we need timestamps as normalized longs
              request = request.sort([
                  $scope.ejs.Sort($scope.panel.annotate.sort[0]).order($scope.panel.annotate.sort[1]).ignoreUnmapped(true),
                  $scope.ejs.Sort($scope.panel.timefield).desc().ignoreUnmapped(true)
              ]);
          }

          // Populate the inspector panel
          $scope.populate_modal(request);

          // Then run it
          results = request.doSearch();

          // Populate scope when we have results
          return results.then(function (results) {
              $scope.panelMeta.loading = false;
              if (segment === 0) {
                  $scope.legend = [];
                  $scope.hits = 0;
                  term_map = {};
                  $scope.annotations = [];
                  query_id = $scope.query_id = new Date().getTime();
              }

              // Check for error and abort if found
              if (!(_.isUndefined(results.error))) {
                  $scope.panel.error = $scope.parse_error(results.error);
              }
              // Make sure we're still on the same query/queries
              else if ($scope.query_id === query_id) {

                  var i = 0,
                      time_series,
                      hits,
                      counters; // Stores the bucketed hit counts.

                  var init_term_series = function () {
                      var term_series = {};
                      var tsOpts = {
                          interval: _interval,
                          start_date: _range && _range.from,
                          end_date: _range && _range.to,
                          fill_style: $scope.panel.derivative ? 'null' : $scope.panel.zerofill ? 'minimal' : 'no'
                      };
                      term_series.time_series = new timeSeries.ZeroFilled(tsOpts);
                      term_series.hits = 0;
                      term_series.counters = {};
                      return term_series;
                  }

                  var aggBucket = function (bucket, datebucket, query) {
                      var term_series;
                      if (_.isUndefined(term_map[bucket.key])) {
                          term_series = init_term_series();
                          term_series.label = bucket.key;
                          term_map[bucket.key] = term_series;
                      }

                      term_series = term_map[bucket.key];

                      var nested_doc_account = (term_series.time_series._data[datebucket.key] || 0) + bucket.doc_count;
                      term_series.time_series.addValue(datebucket.key, nested_doc_account);
                      term_series.hits += bucket.doc_count;
                      term_series.info = query;
                  }

                  _.each(queries, function (query) {
                      var query_results = results.aggregations[0];

                      _.each(query_results.buckets, function (datebucket) {

                          $scope.hits += datebucket.doc_count;

                          var term_series;
                          //if there is a nested aggregation
                          if (!_.isUndefined(datebucket[1])) {
                              _.each(datebucket[1].buckets, function (bucket1) {

                                  if (!_.isUndefined(bucket1[2]) && !_.isEmpty(bucket1[2].buckets)) {
                                      var bucket2DocCount = 0;
                                      _.each(bucket1[2].buckets, function (bucket2) {
                                          aggBucket(bucket2, datebucket, query);
                                          bucket2DocCount += bucket2.doc_count;
                                      });

                                      if (bucket1.doc_count > bucket2DocCount) {
                                          var remainBucket = {};
                                          remainBucket.key = bucket1.key;
                                          remainBucket.doc_count = bucket1.doc_count - bucket2DocCount;

                                          aggBucket(remainBucket, datebucket, query);
                                      }

                                  } else {
                                      aggBucket(bucket1, datebucket, query);
                                  }
                              })
                          } else {
                              var fake_lable = "";
                              if (_.isUndefined(term_map[fake_lable])) {
                                  term_series = init_term_series();
                                  term_series.label = fake_lable;
                                  term_map[fake_lable] = term_series;
                              }

                              term_series = term_map[fake_lable];
                              var doc_account = (term_series.time_series._data[datebucket.key] || 0) + datebucket.doc_count;
                              term_series.time_series.addValue(datebucket.key, doc_account);
                              term_series.hits += datebucket.doc_count;
                              term_series.info = query;
                          }
                      });

                      $scope.legend[i] = {query: query, hits: hits};
                  });

                  if ($scope.panel.annotate.enable) {
                      $scope.annotations = $scope.annotations.concat(_.map(results.hits.hits, function (hit) {
                          var _p = _.omit(hit, '_source', 'sort', '_score');
                          var _h = _.extend(kbn.flatten_json(hit._source), _p);
                          return {
                              min: hit.sort[1],
                              max: hit.sort[1],
                              eventType: "annotation",
                              title: null,
                              description: "<small><i class='icon-tag icon-flip-vertical'></i> " +
                              _h[$scope.panel.annotate.field] + "</small><br>" +
                              moment(hit.sort[1]).format('YYYY-MM-DD HH:mm:ss'),
                              score: hit.sort[0]
                          };
                      }));
                      // Sort the data
                      $scope.annotations = _.sortBy($scope.annotations, function (v) {
                          // Sort in reverse
                          return v.score * ($scope.panel.annotate.sort[1] === 'desc' ? -1 : 1);
                      });
                      // And slice to the right size
                      $scope.annotations = $scope.annotations.slice(0, $scope.panel.annotate.size);
                  }
              }

              // If we still have segments left, get them
              if (segment < indices.length - 1) {
                  $scope.get_data(term_map, segment + 1, query_id);
              } else {
                  selectedIndices=[];
                  $scope.$emit('render', term_map);
              }
          });
      })
    };

    // function $scope.zoom
    // factor :: Zoom factor, so 0.5 = cuts timespan in half, 2 doubles timespan
    $scope.zoom = function(factor) {
      var _range = filterSrv.timeRange('last');
      var _timespan = (_range.to.valueOf() - _range.from.valueOf());
      var _center = _range.to.valueOf() - _timespan/2;

      var _to = (_center + (_timespan*factor)/2);
      var _from = (_center - (_timespan*factor)/2);

      // If we're not already looking into the future, don't.
      if(_to > Date.now() && _range.to < Date.now()) {
        var _offset = _to - Date.now();
        _from = _from - _offset;
        _to = Date.now();
      }

      if(factor > 1) {
        filterSrv.removeByType('time');
      }
      filterSrv.set({
        type:'time',
        from:moment.utc(_from).toDate(),
        to:moment.utc(_to).toDate(),
        field:$scope.panel.timefield
      });
    };

    // I really don't like this function, too much dom manip. Break out into directive?
    $scope.populate_modal = function(request) {
      $scope.inspector = angular.toJson(JSON.parse(request.toString()),true);
    };

    $scope.set_refresh = function (state) {
      $scope.refresh = state;
    };

    $scope.close_edit = function() {
      if($scope.refresh) {
        $scope.get_data();
      }
      $scope.refresh =  false;
      $scope.$emit('render');
    };

    $scope.render = function() {
      $scope.$emit('render');
    };

//    $scope.toggle_series = function(seriesIdx){
//      var legend_data = $scope.plot.getData();
//      legend_data[seriesIdx].lines.show = !legend_data[seriesIdx].lines.show;
//      $scope.plot.setData(legend_data);
//      $scope.plot.draw();
//    };


  });

  module.directive('histogramChart', function($q,dashboard, filterSrv) {
    return {
      restrict: 'A',
      template: '<div></div>',
      link: function(scope, elem) {
        var data,plot;

        scope.$on('refresh',function(){
          scope.get_existing_nodes();
          scope.get_data();
        });

        // Receive render events
        scope.$on('render',function(event,d){
          data = d || data;
          render_panel(data);
        });

          var scale = function(series,factor) {
          return _.map(series,function(p) {
            return [p[0],p[1]*factor];
          });
        };

        var scaleSeconds = function(series,interval) {
          return _.map(series,function(p) {
            return [p[0],p[1]/kbn.interval_to_seconds(interval)];
          });
        };

        var derivative = function(series) {
          return _.map(series, function(p,i) {
            var _v;
            if(i === 0 || p[1] === null) {
              _v = [p[0],null];
            } else {
              _v = series[i-1][1] === null ? [p[0],null] : [p[0],p[1]-(series[i-1][1])];
            }
            return _v;
          });
        };
        // Function for rendering panel
        function render_panel(term_map) {
          // IE doesn't work without this
          try {
            elem.css({height:scope.panel.height||scope.row.height});
          } catch(e) {return;}

          // Set barwidth based on specified interval
          var barwidth = kbn.interval_to_ms(scope.panel.interval);

          var stack = scope.panel.stack ? true : null;

          var labelFormat = function(label, series) {
              //TODO: this doesn't work, it seems when jquery is creating the label,
              //it can't access angularjs scope
            return '<a ng-href="{{def}}" ng-click="toggle_series">' + label + '</div>';
          };

            var options = {
              legend: {
                  show: true,
                  labelFormatter: labelFormat
              },
              series: {
                stackpercent: scope.panel.stack ? scope.panel.percentage : false,
                stack: scope.panel.percentage ? null : stack,
                lines:  {
                  show: scope.panel.lines,
                  // Silly, but fixes bug in stacked percentages
                  fill: scope.panel.fill === 0 ? 0.001 : scope.panel.fill/10,
                  lineWidth: scope.panel.linewidth,
                  steps: false
                },
                bars:   {
                  show: scope.panel.bars,
                  fill: 1,
                  barWidth: barwidth/1.5,
                  zero: false,
                  lineWidth: 0
                },
                points: {
                  show: scope.panel.points,
                  fill: 1,
                  fillColor: false,
                  radius: scope.panel.pointradius
                },
                shadowSize: 1
              },
              yaxis: {
                show: scope.panel['y-axis'],
                min: scope.panel.grid.min,
                max: scope.panel.percentage && scope.panel.stack ? 100 : scope.panel.grid.max
              },
              xaxis: {
                timezone: scope.panel.timezone,
                show: scope.panel['x-axis'],
                mode: "time",
                min: _.isUndefined(scope.range.from) ? null : scope.range.from.getTime(),
                max: _.isUndefined(scope.range.to) ? null : scope.range.to.getTime(),
                timeformat: time_format(scope.panel.interval),
                label: "Datetime",
                ticks: elem.width()/100
              },
              grid: {
                backgroundColor: null,
                borderWidth: 0,
                hoverable: true,
                color: '#c8c8c8'
              }
            };

            if (scope.panel.y_format === 'bytes') {
              options.yaxis.mode = "byte";
              options.yaxis.tickFormatter = function (val, axis) {
                return kbn.byteFormat(val, 0, axis.tickSize);
              };
            }

            if (scope.panel.y_format === 'short') {
              options.yaxis.tickFormatter = function (val, axis) {
                return kbn.shortFormat(val, 0, axis.tickSize);
              };
            }

            if(scope.panel.annotate.enable) {
              options.events = {
                clustering: true,
                levels: 1,
                data: scope.annotations,
                types: {
                  'annotation': {
                    level: 1,
                    icon: {
                      width: 20,
                      height: 21,
                      icon: "histogram-marker"
                    }
                  }
                }
                //xaxis: int    // the x axis to attach events to
              };
            }

            if(scope.panel.interactive) {
              options.selection = { mode: "x", color: '#666' };
            }

            // when rendering stacked bars, we need to ensure each point that has data is zero-filled
            // so that the stacking happens in the proper order
            var required_times = [];
            if(!_.isEmpty(term_map)) {
              required_times = Array.prototype.concat.apply([], _.map(term_map, function (query) {
                return query.time_series.getOrderedTimes();
              }));
              required_times = _.uniq(required_times.sort(function (a, b) {
                // decending numeric sort
                return a-b;
              }), true);
            };

             _.each(term_map, function (term){
                  var _d =   term.time_series.getFlotPairs(required_times);
                  if(scope.panel.derivative) {
                      _d = derivative(_d);
                  }
                  if(scope.panel.scale !== 1) {
                      _d = scale(_d,scope.panel.scale);
                  }
                  if(scope.panel.scaleSeconds) {
                      _d = scaleSeconds(_d,scope.panel.interval);
                  }
                  term.data = _d;
              });

            scope.plotdataset=_.map(term_map,function(v,k){
                    return v;
              });


            scope.plotdataset.sort(function(d1,d2){
                  return d1["label"].localeCompare((d2["label"]));
              });

              if(!_.isEmpty(scope.plotdataset)) {
                  options.colors = $.map(scope.plotdataset, function (o, i) {
                      return dashboard.get_color(o.label, i);
//                      return $.Color({ hue: hash_code_color(o.label, i,dataset.length), saturation: 0.95, lightness: 0.35, alpha: 1 }).toHexString();

                  });
              };

              plot = $.plot(elem, scope.plotdataset, options);
        }

          function time_format(interval) {
          var _int = kbn.interval_to_seconds(interval);
          if(_int >= 2628000) {
            return "%Y-%m";
          }
          if(_int >= 86400) {
            return "%Y-%m-%d";
          }
          if(_int >= 60) {
            return "%H:%M<br>%m-%d";
          }

          return "%H:%M:%S";
        }

        var $tooltip = $('<div>');
        elem.bind("plothover", function (event, pos, item) {
          var group, value, timestamp, interval;
          interval = " per " + (scope.panel.scaleSeconds ? '1s' : scope.panel.interval);
          if (item) {
            if ( item.series.label) {
              group = '<small style="font-size:0.9em;">' +
                '<i class="icon-circle" style="color:'+item.series.color+';"></i>' + ' ' +
                (item.series.label)+
              '</small><br>';
            } else {
              group = kbn.query_color_dot(item.series.color, 15) + ' ';
            }
            value = (scope.panel.stack && scope.panel.tooltip.value_type === 'individual') ?
              item.datapoint[1] - item.datapoint[2] :
              item.datapoint[1];
            if(scope.panel.y_format === 'bytes') {
              value = kbn.byteFormat(value,2);
            }
            if(scope.panel.y_format === 'short') {
              value = kbn.shortFormat(value,2);
            } else {
              value = numeral(value).format('0,0[.]000');
            }
            timestamp = scope.panel.timezone === 'browser' ?
              moment(item.datapoint[0]).format('YYYY-MM-DD HH:mm:ss') :
              moment.utc(item.datapoint[0]).format('YYYY-MM-DD HH:mm:ss');
            $tooltip
              .html(
                group + value + interval + " @ " + timestamp
              )
              .place_tt(pos.pageX, pos.pageY);
          } else {
            $tooltip.detach();
          }
        });

        elem.bind("plotselected", function (event, ranges) {
          filterSrv.set({
            type  : 'time',
            from  : moment.utc(ranges.xaxis.from).toDate(),
            to    : moment.utc(ranges.xaxis.to).toDate(),
            field : scope.panel.timefield
          });
        });
      }
    };
  });

});
