define([
  'angular',
  'lodash'
],
function (angular, _) {
  'use strict';

  var module = angular.module('kibana.services');

  module.service('json2csv', function($q){
      var _cellMaxLength=32000;

      this.json2csv=function(params0,filename) {

          var params=checkParams(params0);
          var title=createColumnTitles(params);
          var csv=createColumnContent(params,title);
          $q.when(csv).then(function(csv){
              var blob = new Blob([csv], { type: "text/csv" });
              // from filesaver.js
              if(_.isEmpty(filename)){
                  filename="cvs1.cvs";
              }
              window.saveAs(blob, filename);
          });
      };

      var checkParams = function(params0) {
          var params=_.clone(params0);
          if(_.isEmpty(params.data)){
              params.data=params;
          }
          params.data = JSON.parse(JSON.stringify(params.data));
          if (!_.isArray(params.data)) {
              var ar = new Array();
              ar[0] = params.data;
              params.data = ar;
          }

          if(!_.isEmpty(params.sortby)){
              params.data=_.sortBy(params.data,params.sortby);
          }

          if(_.isEmpty(params.fields)){
              params.fields= _.keys(params.data[0]);
          }
          params.del = params.del || ',';
          return params;
      };

      var createColumnTitles = function(params) {
          var str = '';

          params.fields.forEach(function(element) {
              if (str !== '') {
                  str += params.del;
              }
              str += JSON.stringify(element);
          });

          return str;

      };

      var createColumnContent = function(params, str) {
          params.data.forEach(function(data_element) {
              if (data_element && Object.getOwnPropertyNames(data_element).length > 0) {
                  var line = '';
                  var eol = '\n';
                  params.fields.forEach(function(field_element) {
                      if (data_element.hasOwnProperty(field_element)) {
                          //according to http://stackoverflow.com/questions/2668678/importing-csv-with-line-breaks-in-excel-2007
                          //to open csv in excel, csv linebreak should be \n, not \r\n, so excel can show a multiple-line string in a cell
                          //this is tested out in excel 2013
                          //TODO:excel can't deal with \t in a cell, so change it to 8 whitespaces
                          //at least it will make the cvs file readable in excel
                          var fieldStr=JSON.stringify(data_element[field_element])
                              .replace(/\\r\\n|\\n/g,"\n").replace(/\\t/g,"        ");
                          if(fieldStr.length>_cellMaxLength){
                              fieldStr=fieldStr.substring(0,_cellMaxLength-15)+"...(truncated)"+"\"";
                          }
                          line +=fieldStr;
                      }
                      line += params.del;
                  });
                  //remove last delimeter
                  line = line.substring(0, line.length - 1);
                  line = line.replace(/\\"/g, '""');
                  str += eol + line;
              }
          });
          return str;
      };
  });

});