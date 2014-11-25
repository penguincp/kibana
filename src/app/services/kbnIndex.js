define([
  'angular',
  'lodash',
  'config',
  'moment'
],
function (angular, _, config, moment) {
  'use strict';

  var module = angular.module('kibana.services');

  module.service('kbnIndex', function($http, $q, alertSrv, ejsResource) {
    // returns a promise containing an array of all indices matching the index
    // pattern that exist in a given range
    var existing_customers=[];

    this.get_existing_customers=function(){
        return _.union(existing_customers,[all_const]);
    }

    var all_const="All";
    var start_date_const="start_date";
    var end_date_const="end_date";

    var selected_customer=all_const;

    this.get_all_const=function(){
          return all_const;
    }
    this.set_selected_customer=function(customer){
        selected_customer=customer;
    }
    this.get_selected_customer=function(){
        return selected_customer;
    }

      var existing_indices={

      };

      this.indexStartEndTimeOfNodes=function(customer_name,nodeNames){

          var node_indices=existing_indices[customer_name];
          var start_date=moment("2099.01.01 +0000","YYYY.MM.DD Z").toDate();
          var end_date=moment("1970.01.01 +0000" ,"YYYY.MM.DD Z").toDate();


          _.each(node_indices,function(nodeIndex,name){
              if(_.isEmpty(node_indices)){
                  return;
              }
              if(!_.contains(nodeNames,name)){
                  return;
              }

              nodeIndex["dates"].sort(function (date1, date2) {
                  if (date1 > date2) return 1;
                  if (date1 < date2) return -1;
                  return 0;
              });

              if(start_date>nodeIndex["dates"][0]){
                  start_date=nodeIndex["dates"][0];
              }

              if(end_date< _.last( nodeIndex["dates"])){
                  end_date= _.last( nodeIndex["dates"]);
              }

              end_date= moment(end_date).add('days',1).toDate();
          });

          return [start_date,end_date];
      };

      this.indexStartEndTime=function(customer_name){
          var start, end;

          if(_.isEmpty(customer_name) || _.isEqual(customer_name,all_const)){
              start= existing_indices.start_date;
          }else{
              start= existing_indices[customer_name].start_date;
          }

          //see panels\timepicker\module.js, which will set the date to be at the starting hour of the day,
          //e.g. 2014/09/24 00:00:00:000, kibana will use this as a filter to find out documents before this time,
          //we add 1 day to this date, so we can get all documents
          if(_.isEmpty(customer_name)|| _.isEqual(customer_name,all_const)){
              end=existing_indices.end_date;
          }else{
              end=existing_indices[customer_name].end_date;
          }


          return [start,end];
      };

      this.get_nodes=function(customer_name){
          var nodes=[];
          if(_.isEmpty(customer_name) || _.isEqual(customer_name,all_const)){
              _.each(existing_indices,function(customer_indices,customer_name) {
                  if (_.isEqual(customer_name, start_date_const) ||
                      _.isEqual(customer_name, end_date_const)) {
                      return;
                  }

                  _.each(customer_indices, function (node_indices, node_name) {
                      if (_.isEqual(node_name, start_date_const) ||
                          _.isEqual(node_name, end_date_const)) {
                          return;
                      }
                      nodes.push(node_name);
                  });
              });
           }else{
              _.each(existing_indices[customer_name],function(node_indices,node_name){
                  if(_.isEqual(node_name,start_date_const) ||
                      _.isEqual(node_name,end_date_const)){
                      return;
                  }
                  nodes.push(node_name);
              });
          }

          nodes.sort(function(d1,d2){
              return strCompare(d1.toLowerCase(),d2.toLowerCase());
          });

          nodes=_.union(nodes,[all_const]);
          return nodes;
      };

      //often nodes takes the form of node1, node2..., if using string comparison, node10<node2
      //so extract and compare the trailing number
      function strCompare(str1, str2){
          var regex=new RegExp("(.*?)(\\d+$)");
          var m1 = regex.exec(str1);
          if(!_.isEmpty(m1)){
              var m2=  regex.exec(str2);
              if(!_.isEmpty(m2)) {
                  //[0] is the whole string, [1] is the first capture, [2] is the second capture, which is a number
                  var r = m1[1].localeCompare(m2[1]);
                  if (!_.isEqual(r, 0)) {
                      return r;
                  }
                  return parseInt(m1[2],10)-parseInt(m2[2],10);
              }
          }

          return str1.localeCompare(str2);

      }

      var getUTCDate = function (date) {
          var dateStr = date.getUTCFullYear() + '-' + (date.getUTCMonth() + 1) + '-' + date.getUTCDate();

          return moment(dateStr + " +0000", "YYYY-MM-DD Z").toDate();
      };

    this.indices = function(_from,_to,pattern,interval,selected_node) {
      if(_.isEmpty(existing_indices)){
          getAllIndices(pattern,interval).then(function(p) {
            return [];
          })
      };

    var from= getUTCDate(_from);
    var to= getUTCDate(_to);

    var regex=_.clone(pattern);
    regex=regex.replace(/[Y|M|D]/g,'\\d');
    regex=regex.replace(/\[|\]/g,"");
    regex=new RegExp(regex);

      var possible = [];
      if(_.isEmpty(selected_node)){
          selected_node=all_const;
      }

      _.each(existing_indices,function(customer_indices,customer_name){
          if(_.isEqual(customer_name,start_date_const) ||
              _.isEqual(customer_name,end_date_const)){
              return;
          }

         if( !_.isEqual(selected_customer,all_const)) {
             if (!_.isEqual(customer_name, selected_customer)) {
                 return;
             }
         }

            _.each(customer_indices,function(node_indices,node_name){
                if(_.isEqual(node_name,start_date_const) ||
                    _.isEqual(node_name,end_date_const)){
                    return;
                }

                if( !_.isEqual(selected_node,all_const)){
                    if(!_.isEqual(node_name,selected_node)){
                        return;
                    }
                };

                _.each(node_indices["names"],function(index){
                    var nameParts=parseIndexName(regex,index);
                    var date= moment(nameParts[2]+" +0000","YYYY.MM.DD Z").toDate();
                    if(date<=to && date>=from){
                        possible.push(index);
                    }
                });
                //possible=_.union(possible,node_indices["names"]);

            });
      });
        return $q.when(possible);
    };

    var ejs = ejsResource(config.elasticsearch);
      var errorcb = function (data, p) {
          if (p === 404) {
              return [];
          }
          else if (p === 0) {
              alertSrv.set('Error', "Could not contact Elasticsearch at " + ejs.config.server +
                  ". Please ensure that Elasticsearch is reachable from your system.", 'error');
          } else {
              alertSrv.set('Error', "Could not reach " + ejs.config.server + "/_aliases. If you" +
                  " are using a proxy, ensure it is configured correctly", 'error');
          }
          return [];
      };

      function parseIndexName(regex,index_name){
          var match = regex.exec(index_name);
          //if not match, return null, not undefined, thus use isEmpty()
          if(!_.isEmpty(match)) {
              return match.slice(1);
          }
      }
      //get all indices
      function getAllIndices(pattern,interval) {
          var something;
          something = ejs.client.get("/_aliases?ignore_missing=true",
              undefined, undefined, errorcb);

          var regex=_.clone(pattern);
          regex=regex.replace(/[Y|M|D]/g,'\\d');
          regex=regex.replace(/\[|\]/g,"");
          regex=new RegExp(regex);

          return something.then(function(p) {

              _.each(p, function(alias,index_name) {
                  var name_parts=parseIndexName(regex,index_name);
                  if(_.isUndefined(name_parts)){
                      return;
                  }
                  var customer=name_parts[0];
                  var node=name_parts[1];
                  var date=name_parts[2];


                  var customer_indices;
                  if(_.isUndefined(existing_indices[customer])){
                      existing_indices[customer]={};
                  }
                  customer_indices= existing_indices[customer];
                  var node_indices;
                  if(_.isUndefined(customer_indices[node])){
                      customer_indices[node]={};
                  }
                  node_indices=customer_indices[node];
                  if(_.isUndefined(node_indices["dates"])){
                      node_indices["dates"]=[];
                  }
                  var dates=node_indices["dates"];
                  //date in an index name is UTC
                  dates.push(moment(date+" +0000","YYYY.MM.DD Z").toDate());

                  if(_.isUndefined(node_indices["names"])){
                      node_indices["names"]=[];
                  }
                  var names=node_indices["names"];
                  names.push(index_name);

                  //TODO: it should be more flexible, name_parts[2] shouldn't be hard coded to be the date

              });

              existing_indices.start_date=moment( "2099.01.01 +0000","YYYY.MM.DD Z").toDate();
              existing_indices.end_date=moment( "1970.01.01 +0000","YYYY.MM.DD Z").toDate();

              _.each(existing_indices,function(customer_indices,customer_name){
                  if(_.isEqual(customer_name,"start_date") ||
                      _.isEqual(customer_name,"end_date")){
                      return;
                  }

                  existing_customers.push(customer_name);

                  customer_indices.start_date=moment("2099.01.01 +0000","YYYY.MM.DD Z").toDate();
                  customer_indices.end_date=moment("1970.01.01 +0000" ,"YYYY.MM.DD Z").toDate();

                  _.each(customer_indices, function(node_indices,node_name){
                      if(_.isEqual(node_name,"start_date") ||
                          _.isEqual(node_name,"end_date")){
                          return;
                      }
                      if(_.isEmpty(node_indices)){
                          return;
                      }
                      node_indices["dates"].sort(function (date1, date2) {
                          if (date1 > date2) return 1;
                          if (date1 < date2) return -1;
                          return 0;
                      });

                      if(customer_indices.start_date>node_indices["dates"][0]){
                          customer_indices.start_date=node_indices["dates"][0];
                      }

                      if(customer_indices.end_date< _.last( node_indices["dates"])){
                          customer_indices.end_date= _.last( node_indices["dates"]);
                      }
                  });

                  if( existing_indices.start_date>customer_indices.start_date){
                      existing_indices.start_date=customer_indices.start_date;
                  }
                  if( existing_indices.end_date<customer_indices.end_date){
                      existing_indices.end_date=customer_indices.end_date;
                  }

                   // the end date should be added 1, because, e.g. if the last logging happened on 9/28,
                   //the end of the time range should be 9/29 to get all loggings happended on 9/28
                  customer_indices.end_date=moment(customer_indices.end_date).add('days',1).toDate();
              });

              existing_indices.end_date=moment(existing_indices.end_date).add('days',1).toDate();

              existing_customers= _.uniq(existing_customers);
              existing_customers.sort(function(d1,d2){
                  return strCompare(d1.toLowerCase(),d2.toLowerCase());
              });
          });
      }

    // Create an array of date objects by a given interval
    function expand_range(start, end, interval) {
      if(_.contains(['hour','day','week','month','year'],interval)) {
        var range;
        start = moment(start).clone();
        // In case indexes are created in local timezone viewpoint, e.g. rsyslog's
        // omelasticsearch output module.
        // This adjustment covers all timezones and should be harmless.
        // end = moment(end).clone().add('hours',12);
        range = [];
        while (start.isBefore(end)) {
          range.push(start.clone());
          switch (interval) {
          case 'hour':
            start.add('hours',1);
            break;
          case 'day':
            start.add('days',1);
            break;
          case 'week':
            start.add('weeks',1);
            break;
          case 'month':
            start.add('months',1);
            break;
          case 'year':
            start.add('years',1);
            break;
          }
        }
        range.push(moment(end).clone());
        return range;
      } else {
        return false;
      }
    }
  });

});
