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

        module.controller('timepicker', function ($scope, $rootScope, $modal, $q, dashboard, alertSrv, filterSrv, kbnIndex) {
            $scope.panelMeta = {
                status: "Stable",
                description: "A panel for controlling the time range filters. If you have time based data, " +
                " or if you're using time stamped indices, you need one of these"
            };


            // Set and populate defaults
            var _d = {
                status: "Stable",
                time_options: ['5m', '15m', '1h', '6h', '12h', '24h', '2d', '7d', '30d'],
                refresh_intervals: ['5s', '10s', '30s', '1m', '5m', '15m', '30m', '1h', '2h', '1d']
            };
            _.defaults($scope.panel, _d);
            //configs in logstash.json trumps configs inside js
            _.assign($scope.panel, dashboard.getTimeOptionDefault());

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

            $scope.$on('refresh', function () {
                $scope.init();
            });

            $scope.init = function () {
                var time = filterSrv.timeRange('last');
                if (time) {
                    $scope.panel.now = filterSrv.timeRange(false).to === "now" ? true : false;
                    $scope.time = getScopeTimeObj(time.from, time.to, true);
                }
            };

            $scope.set_selected_customer = function () {
                $scope.get_existing_nodes_for_customer();
            };

            $scope.update_date_range = function () {
                var range;
                var selected_nodes = _.pluck(_.select($scope.existing_nodes, "selected"), 'name');
                if (_.isEmpty(selected_nodes) || _.contains(selected_nodes, kbnIndex.get_all_const())) {
                    range = kbnIndex.indexStartEndTime($scope.selected_customer);
                } else {
                    range = kbnIndex.indexStartEndTimeOfNodes($scope.selected_customer, selected_nodes);
                }
                $scope.temptime =
                    getScopeTimeObj(range[0], range[1], false);

                //Date picker needs the date to be at the start of the day
                $scope.temptime.from.date.setHours(0, 0, 0, 0);
                $scope.temptime.to.date.setHours(0, 0, 0, 0);
                $scope.panel.now = false;

            };

            $scope.get_existing_nodes_for_customer = function () {
                var nodes = kbnIndex.get_nodes($scope.selected_customer);
                $scope.existing_nodes = _.map(nodes, function (n) {
                    return {
                        "name": n,
                        "selected": false
                    }
                });

                $scope.show_in_rows = 1;
                $scope.rows_options = [];
                var i = 1;
                _.each($scope.existing_nodes, function (v) {
                    $scope.rows_options.push(i++);
                });
            }

            $scope.customTime = function () {
                // Assume the form is valid since we're setting it to something valid
                $scope.input.$setValidity("dummy", true);
                if (_.isEmpty($scope.temptime)) {
                    var range = kbnIndex.indexStartEndTime($scope.selected_customer);
                    $scope.temptime = getScopeTimeObj(range[0], range[1], false);
                }

                $scope.existing_customers = kbnIndex.get_existing_customers();
                if (_.isEmpty($scope.selected_customer)) {
                    $scope.selected_customer = $scope.existing_customers[0];
                    $scope.set_selected_customer();
                }

                $q.when(customTimeModal).then(function (modalEl) {
                    modalEl.modal('show');
                });
            };

            // Constantly validate the input of the fields. This function does not change any date variables
            // outside of its own scope
            $scope.validate = function (time) {
                // Assume the form is valid. There is a hidden dummy input for invalidating it programatically.
                $scope.input.$setValidity("dummy", true);

                var _from = time.from.date,
                  _to = time.to.date,
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

            $scope.setNow = function () {
                $scope.time.to = getTimeObj(new Date());
            };

            $scope.setAbsoluteTimeFilter = function () {
                var time = $scope.validate($scope.temptime);

                $scope.time = getScopeTimeObj(time.from, time.to, true);


                // Create filter object
                var _filter = _.cloneDeep({
                    from: $scope.time.from.date,
                    to: $scope.time.to.date
                });

                _filter.type = 'time';
                _filter.field = $scope.panel.timefield;

                if ($scope.panel.now) {
                    _filter.to = "now";
                }

                // Clear all time filters, set a new one
                filterSrv.removeByType('time', true);

                $scope.panel.filter_id = filterSrv.set(_filter);

                kbnIndex.set_selected_customer($scope.selected_customer);


                $rootScope.$broadcast("timeOptions", {
                    timefield: $scope.panel.timefield,
                    timezone: $scope.panel.timezone,
                    auto_int: $scope.panel.auto_int,
                    resolution: $scope.panel.resolution
                });

                var selected_nodes = _.pluck(_.select($scope.existing_nodes, "selected"), 'name');
                create_panels_for_nodes(selected_nodes);

                return $scope.panel.filter_id;
            };

            function create_panels_for_nodes(nodes) {
                if (_.isEmpty(nodes)) {
                    return;
                }

                var row, panel;
                var findHistogramPanel = function (rows) {
                    _.find(rows, function (r) {
                        if (_.isEmpty(r.panels)) {
                            return;
                        }

                        panel = _.find(r.panels, function (p) {
                            return p.type === "histogram";
                        });

                        if (!_.isEmpty(panel)) {
                            row = r;
                            return;
                        }
                    });
                };

                findHistogramPanel(dashboard.current.rows);
                if (_.isEmpty(panel)) {
                    findHistogramPanel(dashboard.getDashDefault().rows);
                    if (!_.isEmpty(panel)) {
                        _.find(dashboard.current.rows, function (r) {
                            if (_.isEmpty(r.panels)) {
                                r.panels.push(panel);
                                row = r;
                            }
                        });
                    }
                }

                if (_.isEmpty(panel)) {
                    alertSrv.set('Error', "Couldn't show histogram chart, make sure you either configure a histogram chart through UI or define one in logstash.json", 'error');
                    return;
                }
                ;

                if (nodes.length < row.panels.length) {
                    row.panels.splice(nodes.length);
                }

                var span = 12;
                if ($scope.show_in_rows != nodes.length) {
                    var nodes_in_one_row = Math.round(nodes.length / $scope.show_in_rows);
                    span = Math.floor(12 / nodes_in_one_row);
                }

                var i = 0;
                _.each(row.panels, function (p) {
                    p.node = nodes[i++];
                    p.span = span;
                });
                _.each(nodes.slice(i), function (n) {
                        var cp = angular.copy(panel);
                        cp.node = n;
                        cp.span = span;
                        row.panels.push(cp);
                    }
                );
            };


            $scope.setRelativeFilter = function (timespan) {

                $scope.panel.now = true;
                // Create filter object
                var _filter = {
                    type: 'time',
                    field: $scope.panel.timefield,
                    from: "now-" + timespan,
                    to: "now"
                };

                // Clear all time filters, set a new one
                filterSrv.removeByType('time', true);

                // Set the filter
                $scope.panel.filter_id = filterSrv.set(_filter);

                // Update our representation
                $scope.time = getScopeTimeObj(kbn.parseDate(_filter.from), new Date(), true);

                return $scope.panel.filter_id;
            };

            var pad = function (n, width, z) {
                z = z || '0';
                n = n + '';
                return n.length >= width ? n : new Array(width - n.length + 1).join(z) + n;
            };

            var reversePad = function (n, width, z) {
                z = z || '0';
                n = n + '';
                return n.length >= width ? n : n + new Array(width - n.length + 1).join(z);
            };

            var cloneTime = function (time) {
                var _n = {
                    from: _.clone(time.from),
                    to: _.clone(time.to)
                };
                // Create new dates as _.clone is shallow.
                _n.from.date = new Date(_n.from.date);
                _n.to.date = new Date(_n.to.date);
                return _n;
            };

            var getScopeTimeObj = function (from, to, isUserInput) {
                return {
                    from: getTimeObj(from, isUserInput),
                    to: getTimeObj(to, isUserInput)
                };
            };

            //pretend a local date to be a utc date
            //e.g. local date is 2014-11-20-00:00:00+0800, the utc date should be 2014-11-19-16:00:00+0000
            //pretend the local date to be utc 2014-11-20-00:00:00+0000
            var pretendLocalToUtc = function (date) {
                var dateStr = date.getFullYear() + '-' + (date.getMonth() + 1) + '-' + date.getDate()
                    + "-" + pad(date.getHours(), 2) + ":" + pad(date.getMinutes(), 2) + ":" + pad(date.getSeconds(), 2) + ":" + pad(date.getMilliseconds(), 2);
                return moment(dateStr + " +0000", "YYYY-MM-DD-HH:mm:ss.SSS Z").toDate();
            };

            //pretend a utc date to be local
            //e.g. utc date is 2014-11-20-00:00:00:00 +0000, the local date should be 2014-11-20-08:00:00:00 +0800
            //pretend the utc date to be 2014-11-20-00:00:00:00 +0800
            var pretendUtcToLocal = function (date) {
                var dateStr = date.getUTCFullYear() + '-' + (date.getUTCMonth() + 1) + '-' + date.getUTCDate()
                    + "-" + pad(date.getUTCHours(), 2) + ":" + pad(date.getUTCMinutes(), 2) + ":" + pad(date.getUTCMilliseconds(), 2) + ":" + pad(date.getMilliseconds(), 2);

                var timezoneOffset = moment(date).zone() / 60;
                var behindUtc=timezoneOffset>0;
                timezoneOffset=Math.abs(timezoneOffset);
                if (timezoneOffset < 10 ) {
                    timezoneOffset = '0' + timezoneOffset;
                } else {
                    timezoneOffset = timezoneOffset + '';
                }
                timezoneOffset = reversePad(timezoneOffset, 4);

                return moment(dateStr + (behindUtc?"-":"+") + timezoneOffset, "YYYY-MM-DD-HH:mm:ss.SSS Z").toDate();
            };

            var getTimeObj = function (date, isUserInput) {
                /*index dates are of utc, if index range are 2014/09/26 and 2014/09/29,
                 the index boundary will be show as 2014/09/26-08:00 and 2014/09/29-08:00,
                 we want it to show 2014/09/26-00:00 and 2014/09/29-00:00*/
                var dateTemp = _.isEqual($scope.panel.timezone, "utc") ?
                    //moment(new Date(date.getTime() + date.getTimezoneOffset() * 60000)).toDate()
                    (isUserInput ? pretendLocalToUtc(date) : pretendUtcToLocal(date))
                    : new Date(date);

                return {
                    date: dateTemp,
                    hour: pad(dateTemp.getHours(), 2),
                    minute: pad(dateTemp.getMinutes(), 2),
                    second: pad(dateTemp.getSeconds(), 2),
                    millisecond: pad(dateTemp.getMilliseconds(), 3)
                };
            };

        });
    });
