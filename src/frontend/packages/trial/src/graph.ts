import 'd3-transition';

import {
  rgb as d3_rgb,
} from 'd3-color';

import {
  HierarchyPointNode as d3_HierarchyPointNode,
  TreeLayout as d3_TreeLayout,
  tree as d3_tree,
  hierarchy as d3_hierarchy,
} from 'd3-hierarchy';

import {
  BaseType as d3_BaseType,
  Selection as d3_Selection,
  select as d3_select,
  pointers as d3_pointers
} from 'd3-selection';

import {
  zoom as d3_zoom,
  zoomIdentity as d3_zoomIdentity,
} from 'd3-zoom';

import * as fs from 'file-saver';

import { wrap, diagonal } from '@noworkflow/utils';

import { TrialConfig } from './config';
import { VisibleTrialNode, VisibleTrialEdge } from './structures';
import {
  TrialGraphData, TrialNodeData,
  TrialEdgeData, ActivationData
} from './structures';

import { D3ZoomEvent } from 'd3';


export
  class TrialGraph {

  i: number;
  config: TrialConfig;
  transform: any;

  div: d3_Selection<d3_BaseType, {}, HTMLElement | null, any>;
  form: d3_Selection<d3_BaseType, {}, HTMLElement | null, any>;
  svg: d3_Selection<d3_BaseType, {}, HTMLElement | null, any>;
  g: d3_Selection<d3_BaseType, {}, HTMLElement | null, any>;
  zoom: any;
  tooltipDiv: d3_Selection<d3_BaseType, {}, HTMLElement | null, any>;

  tree: d3_TreeLayout<{}>;

  root: VisibleTrialNode;

  graphId: string;
  nodes: d3_HierarchyPointNode<{}>[];
  alledges: TrialEdgeData[];

  t1: string;
  t2: string;
  minDuration: { [trial: string]: number };
  maxDuration: { [trial: string]: number };
  totalDuration: { [trial: string]: number };
  maxTotalDuration: number;
  colors: { [trial: string]: number };
  activationStorage: { [aid: string]: ActivationData; };
  showDiffFunction : any;
  nowVisPanel: any;

  constructor(graphId: string, div: any, config: any = {}, showDiffFunction? : any, nowVisPanel?:any) {
    if(showDiffFunction && nowVisPanel){
      this.showDiffFunction = showDiffFunction;
      this.nowVisPanel = nowVisPanel
    }

    this.i = 0;

    let defaultConfig: TrialConfig = {
      customSize: function (g: TrialGraph) {
        return [
          g.config.width,
          g.config.height,
        ]
      },
      customMouseOver: (g: TrialGraph, d: VisibleTrialNode) => false,
      customMouseOut: (g: TrialGraph, d: VisibleTrialNode) => false,
      customForm: (g: TrialGraph, form: d3_Selection<d3_BaseType, {}, HTMLElement | null, any>) => null,
      customLoadTooltip: (g: TrialGraph, div: HTMLDivElement, text: string, trialid: string, aid: string) => null,

      duration: 750,

      top: 50,
      right: 30,
      bottom: 80,
      left: 30,

      width: 900,
      height: 500,

      useTooltip: false,
      fontSize: 10,
      labelFontSize: 10,

      nodeSizeX: 47,
      nodeSizeY: 100,

      queryTooltip: false
    };
    this.config = (Object as any).assign({}, defaultConfig, config);


    this.graphId = graphId;

    this.zoom = d3_zoom<SVGSVGElement, any>()
      .on("zoom", (event: D3ZoomEvent<SVGSVGElement, any>) => {
        return this.zoomFunction(event);
      })
      .on("start", () => d3_select('body').style("cursor", "move"))
      .on("end", () => d3_select('body').style("cursor", "auto"))
      .wheelDelta(function () {
        const e = event as WheelEvent;
        return -e.deltaY * (e.deltaMode ? 120 : 1) / 2000;
      })

    this.div = d3_select(div)
    this.form = this.div
      .append("form")
      .classed("trial-toolbar", true);

    this.svg = d3_select<SVGSVGElement, any>(div)
      .append("div")
      .append("svg")
      .attr("width", this.config.width)
      .attr("height", this.config.height)
      .call(this.zoom);

    this.createMarker('end', 'enormal', 'black');
    this.createMarker('endbefore', 'ebefore', 'red');
    this.createMarker('endafter', 'eafter', 'green');

    this.g = this.svg.append("g")
      .attr("id", this._graphId())
      .attr("transform", "translate(0,0)")
      .classed('TrialGraph', true);

    this.tree = d3_tree<VisibleTrialNode>()
      .nodeSize([
        this.config.nodeSizeX,
        this.config.nodeSizeY
      ]);

    // Tooltip
    this.tooltipDiv = d3_select<HTMLDivElement, any>("body").append("div")
      .attr("class", "now-tooltip now-trial-tooltip")
      .style("opacity", 0)
      .on("mouseout", () => {
        this.closeTooltip();
      });

    // Zoom
    this.svg
      .call(this.zoom.transform, d3_zoomIdentity.translate(
        this.config.left + this.config.width / 2,
        this.config.top
      ))

    this.activationStorage = {};
  }

  init(data: TrialGraphData, t1: string, t2: string) {
    this.t1 = t1;
    this.t2 = t2;

    // **Toolbar**
    this.createToolbar(this.form);

    // **Graph**
    this.minDuration = data.min_duration;
    this.maxDuration = data.max_duration;
    this.totalDuration = {};
    this.totalDuration[t1] = this.maxDuration[t1] - this.minDuration[t1];
    this.totalDuration[t2] = this.maxDuration[t2] - this.minDuration[t2];
    this.maxTotalDuration = Math.max(
      this.totalDuration[t1], this.totalDuration[t2]
    );

    this.colors = data.colors;

    if (!data.root) return;

    this.root = d3_hierarchy(data.root, function (d) { return d.children; }) as VisibleTrialNode;
    this.root.x0 = 0;
    this.root.y0 = (this.config.width) / 2;

    this.alledges = data.edges;
    this.update(this.root);
  }

  createToolbar(form: d3_Selection<d3_BaseType, {}, HTMLElement | null, any>) {
    let self = this;
    form = form.append("div")
      .classed("buttons buttonsGraph", true);
    this.config.customForm(this, form);
    // Reset zoom
    form.append("a")
      .classed("toollink", true)
      .attr("id", "trial-" + this.graphId + "-restore-zoom")
      .attr("href", "#")
      .attr("title", "Restore zoom")
      .on("click", () => this.restorePosition())
      .append("i")
      .classed("fa fa-eye", true)

    // Toggle Tooltips
    let tooltipsToggle = form.append("input")
      .attr("id", "trial-" + this.graphId + "-toolbar-tooltips")
      .attr("type", "checkbox")
      .attr("name", "trial-toolbar-tooltips")
      .attr("value", "show")
      .property("checked", this.config.useTooltip)
      .on("change", () => {
        this.closeTooltip();
        this.config.useTooltip = tooltipsToggle.property("checked");
      });
    form.append("label")
      .attr("for", "trial-" + this.graphId + "-toolbar-tooltips")
      .attr("title", "Show tooltips on mouse hover")
      .append("i")
      .classed("fa fa-comment", true)

    // Download SVG
    form.append("a")
      .classed("toollink", true)
      .attr("id", "trial-" + this.graphId + "-download")
      .attr("href", "#")
      .attr("title", "Download graph SVG")
      .on("click", () => {
        this.download();
      })
      .append("i")
      .classed("fa fa-download", true)

    // Set Font Size
    let fontToggle = form.append("input")
      .attr("id", "trial-" + this.graphId + "-toolbar-fonts")
      .attr("type", "checkbox")
      .attr("name", "trial-toolbar-fonts")
      .attr("value", "show")
      .property("checked", false)
      .on("change", () => {
        let display = fontToggle.property("checked") ? "inline-block" : "none";
        fontSize.style("display", display);
        labelFontSize.style("display", display);
      });
    form.append("label")
      .attr("for", "trial-" + this.graphId + "-toolbar-fonts")
      .attr("title", "Set font size")
      .append("i")
      .classed("fa fa-font", true)
    let fontSize = form.append("input")
      .attr("type", "number")
      .attr("value", this.config.fontSize)
      .style("width", "50px")
      .style("display", "none")
      .attr("title", "Node font size")
      .on("change", () => {
        this.config.fontSize = fontSize.property("value");
        this.svg.selectAll(".node text").attr("font-size", this.config.fontSize);
      })
    let labelFontSize = form.append("input")
      .attr("type", "number")
      .attr("value", this.config.labelFontSize)
      .style("width", "50px")
      .style("display", "none")
      .attr("title", "Arrow font size")
      .on("change", () => {
        this.config.labelFontSize = labelFontSize.property("value");
        this.svg.selectAll("text.label_text").attr("font-size", this.config.labelFontSize);
      })

    // Set distances
    let setDistances = function () {
      self.config.nodeSizeX = distanceX.property("value");
      self.config.nodeSizeY = distanceY.property("value");
      self.wrapText()
      self.tree
        .nodeSize([
          self.config.nodeSizeX,
          self.config.nodeSizeY
        ]);
      self.update(self.root);
    }


    // Set Distance X
    let distanceXToggle = form.append("input")
      .attr("id", "trial-" + this.graphId + "-toolbar-distance-x")
      .attr("type", "checkbox")
      .attr("name", "trial-toolbar-distance-x")
      .attr("value", "show")
      .property("checked", false)
      .on("change", () => {
        let display = distanceXToggle.property("checked") ? "inline-block" : "none";
        distanceX.style("display", display);
      });
    form.append("label")
      .attr("for", "trial-" + this.graphId + "-toolbar-distance-x")
      .attr("title", "Set horizontal distance")
      .append("i")
      .classed("fa fa-arrows-h", true)
    let distanceX = form.append("input")
      .attr("type", "number")
      .attr("value", this.config.nodeSizeX)
      .style("width", "65px")
      .style("display", "none")
      .attr("title", "Node horizontal distance")
      .on("change", setDistances)

    // Set Distance Y
    let distanceYToggle = form.append("input")
      .attr("id", "trial-" + this.graphId + "-toolbar-distance-y")
      .attr("type", "checkbox")
      .attr("name", "trial-toolbar-distance-y")
      .attr("value", "show")
      .property("checked", false)
      .on("change", () => {
        let display = distanceYToggle.property("checked") ? "inline-block" : "none";
        distanceY.style("display", display);
      });
    form.append("label")
      .attr("for", "trial-" + this.graphId + "-toolbar-distance-y")
      .attr("title", "Set vertical distance")
      .append("i")
      .classed("fa fa-arrows-v", true)
    let distanceY = form.append("input")
      .attr("type", "number")
      .attr("value", this.config.nodeSizeY)
      .style("width", "65px")
      .style("display", "none")
      .attr("title", "Node vertical distance")
      .on("change", setDistances)

    // Submit
    form.append("input")
      .attr("type", "submit")
      .attr("name", "prevent-enter")
      .attr("onclick", "return false;")
      .style("display", "none");
  }

  load(data: TrialGraphData, t1: string, t2: string) {
    this.init(data, t1, t2);
    this.updateWindow();
  }

  restorePosition(): void {
    this.wrapText();
    this.svg
      .call(this.zoom.transform, d3_zoomIdentity.translate(
        this.config.left + this.config.width / 2,
        this.config.top
      ))
  }

  updateWindow(): void {
    let size = this.config.customSize(this);
    this.config.width = size[0];
    this.config.height = size[1];
    this.svg
      .attr("width", size[0])
      .attr("height", size[1]);
  }

  update(source: VisibleTrialNode) {
    let treeData = this.tree(this.root);
    this.nodes = treeData.descendants();

    var node = this.g.selectAll('g.node')
      .data(this.nodes, (d: any) => { return d.id || (d.id = ++this.i); });

    let validNodes: { [key: string]: VisibleTrialNode } = {};
    this.nodes.forEach((node: VisibleTrialNode) => {
      validNodes[node.data.index] = node;
    });
    var edges: VisibleTrialEdge[] = this.alledges.filter((edge: TrialEdgeData) => {
      let source: VisibleTrialNode = validNodes[edge.source];
      let target: VisibleTrialNode = validNodes[edge.target];

      if (source == undefined || target == undefined) {
        return false;
      }
      return true;
    }).map((edge) => {
      let source: VisibleTrialNode = validNodes[edge.source];
      let target: VisibleTrialNode = validNodes[edge.target];
      var copy: any = { ...edge };
      copy.id = edge.source + "-" + edge.target;
      copy.source = source;
      copy.target = target;
      return copy as VisibleTrialEdge;
    });

    this.updateNodes(source, node);
    this.updateLinks(source, edges);
    this.updateLinkLabels(edges);

    // Store old positions for transition
    this.nodes.forEach(function (d: VisibleTrialNode, i: number) {
      d.x0 = d.x;
      d.y0 = d.y;
    });
    this.wrapText();
  }

  download(name?: string) {
    var isFileSaverSupported = false;
    try {
      isFileSaverSupported = !!new Blob();
    } catch (e) {
      alert("blob not supported");
    }
    name = (name === undefined) ? "trial.svg" : name;
    let gnode: any = this.g.node()
    var bbox = gnode.getBBox();
    var width = this.svg.attr("width"), height = this.svg.attr("height");
    this.g.attr("transform", "translate(" + (-bbox.x + 5) + ", " + (-bbox.y + 5) + ")");
    let svgNode: any = this.svg
      .attr("title", "Trial")
      .attr("version", 1.1)
      .attr("width", bbox.width + 10)
      .attr("height", bbox.height + 10)
      .attr("xmlns", "http://www.w3.org/2000/svg")
      .node();
    var html = svgNode.parentNode.innerHTML;
    html = '<svg xmlns:xlink="http://www.w3.org/1999/xlink" ' + html.slice(4);
    this.svg
      .attr("width", width)
      .attr("height", height);
    this.g.attr("transform", this.transform);
    if (isFileSaverSupported) {
      console.log(html);
      var blob = new Blob([html], { type: "image/svg+xml" });
      fs.saveAs(blob, name);
    }
  }

  wrapText() {
    this.svg.selectAll(".node text:not(.nowrap)")
      .call(wrap, this.config.nodeSizeX);
  }

  private calculateColor(d: TrialNodeData, trial_id: string): any {
    var proportion = Math.round(255 * (1.0 - (d.duration[trial_id] / this.maxTotalDuration)));
    //Math.round(510 * (node.duration - self.min_duration[node.trial_id]) / self.total_duration[node.trial_id]);
    return d3_rgb(255, proportion, proportion, 255).toString();
  }

  getFunctionDiff(activations: any, trial_ids : any) {
    let showModal = (activations[trial_ids[0]].length > 1 || activations[trial_ids[1]].length > 1);
    let modal : any;
    let modalBody;
    let button;

    if(showModal){
      modal = d3_select(document.getElementById("main"))
      .append("div").classed("modal fade show", true)
      .attr("id", "functionDiffModal")
      .attr("tabindex", "-1")
      .attr("role", "dialog")
      .attr("aria-labelledby", "functionDiffModalLabel")
      .style("display", "none")
      .attr("aria-hidden", "false")
      .style("display", "block");
      
      let modalDialog = modal.append("div").classed("modal-dialog", true).attr("role","document");

      let modalContent = modalDialog.append("div").classed("modal-content", true);
      
      let modalHeader = modalContent.append("div").classed("modal-header", true);
      modalHeader.append("h5").classed("modal-title", true).attr("id", "functionDiffModalLabel").text("Select a function activation: ");
      modalHeader.append("button").classed("close", true).attr("data-dismiss", "modal").attr("aria-label", "Close")
      .append("span").attr("aria-hidden", "true").html("&times;").on("click", () => modal.remove());

      modalBody = modalContent.append("div").classed("modal-body", true);
      modalBody.append("p").text("This function was called multipled times. Select the activations you want to see their diff").style("font-weight", "bold");


      button = modalContent.append("div").classed("modal-footer", true).append("button").classed("btn btn-primary", true).text("Confirm");
    }

    

    let compareFunctionCallsUrl = "commands/diff";
    let windowLabel = "Diff"
    for (let i = 0; i < trial_ids.length; i++) {
      let trial = trial_ids[i]
      
      if(showModal){
        let trialNumber = i == 0 ? "first" : "second";
        modalBody!.append("span").text("Select the " +trialNumber+" trial activation: ");
        let select = modalBody!.append("select").classed("form-select", true).attr("arial-label", "functionTrial"+trial).attr("id", "functionTrial"+trial);
        for(let activation in activations[trial]){

          fetch("/diff/getFunctionActivationArguments/"+trial+"/"+activations[trial][activation], {
            method: 'GET', // *GET, POST, PUT, DELETE, etc.
            headers: {
              'Content-Type': 'application/json'
            },
          }).then((response) => {
    
            response.json().then((json) => {
              select.append("option").attr("value", activations[trial][activation]).text(activations[trial][activation] + " params: " + json.function_params.toString());
            });
          }); 
        }

        modalBody!.append("br");

      } else {
        if (compareFunctionCallsUrl.length > 0) compareFunctionCallsUrl += "/";
        compareFunctionCallsUrl += trial + "/";
        compareFunctionCallsUrl += activations[trial];
        windowLabel += " trial " + trial + " activation_id " + activations[trial];
      }
      
    }

    if(showModal){
      button?.on("click", ()=>{
        let firstTrialActivation = (<HTMLSelectElement>document.getElementById("functionTrial"+trial_ids[0])).selectedOptions[0].value;
        let secondTrialActivation = (<HTMLSelectElement>document.getElementById("functionTrial"+trial_ids[1])).selectedOptions[0].value;
        compareFunctionCallsUrl += "/" + trial_ids[0] + "/" + firstTrialActivation + "/" + trial_ids[1] + "/" + secondTrialActivation;
        windowLabel += " trial " + trial_ids[0] + " activation_id " + firstTrialActivation + " trial " + trial_ids[1] + " activation_id " + secondTrialActivation;

        makeRequest(this.showDiffFunction, this.nowVisPanel);
        modal!.remove();
      });
    }else{
      makeRequest(this.showDiffFunction, this.nowVisPanel);
    }

    function makeRequest(showDiffFunction : any, nowVisPanel : any) {
      fetch(compareFunctionCallsUrl, {
        method: 'GET', // *GET, POST, PUT, DELETE, etc.
        headers: {
          'Content-Type': 'application/json'
        },
      }).then((response) => {

        response.json().then((json) => {
          if (showDiffFunction) showDiffFunction(json, windowLabel, nowVisPanel);
        });
      });
    }
  }

  private closeTooltip(): void {
    this.tooltipDiv.transition()
      .duration(500)
      .style("opacity", 0);
    this.tooltipDiv.classed("hidden", true);
  }

  private showTooltip(event: MouseEvent, d: TrialNodeData, trial_id: string) {
    var self = this;
    this.tooltipDiv.classed("hidden", false);
    this.tooltipDiv.transition()
      .duration(200)
      .style("opacity", 0.9);
    if (this.config.queryTooltip) {
      var string = d.tooltip[trial_id]
      var regexp = (/T(.*) - (\d*)<br>Line \d*?<br>/g)
      var match = regexp.exec(string);
      this.tooltipDiv.html("")
        .style("left", (event.pageX - 3) + "px")
        .style("top", (event.pageY - 28) + "px");
      while (match != null) {
        var div = document.createElement("div");
        //var div2 = document.createElement("div");
        this.tooltipDiv.append(() => div);
        //this.tooltipDiv.append(() => div2);
        var aid = match[2];
        if (aid in self.activationStorage) {
          this.updateTooltipDiv(aid, div);
        } else {
          self.config.customLoadTooltip(self, div, match[0], match[1], match[2]);
        }
        match = regexp.exec(string);
      }
    } else {
      this.tooltipDiv.html(d.tooltip[trial_id])
        .style("left", (event.pageX - 3) + "px")
        .style("top", (event.pageY - 28) + "px");
    }

  }

  updateTooltipDiv(activationId: string, div: Element) {
    var data = this.activationStorage[activationId];
    var title = data.id + " - " + data.name;
    if (data.hash != "") {
      title = '<a href="/trials/files/' + data.hash + '/' + data.name + '">' + title + "</a>";
    }
    var result = [
      '<span class="attr"> <span style="font-weight: bold;">' + title + '</span></span>',
      '<span class="attr"> <span style="font-weight: bold;"> Line: </span> <span class="line">' + data.line + "</span></span>",
      '<span class="attr"> <span style="font-weight: bold;"> Start: </span> <span class="start">' + data.start + "</span></span>",
      '<span class="attr"> <span style="font-weight: bold;"> Finish: </span> <span class="finish">' + data.finish + "</span></span>",
      '<span class="attr"> <span style="font-weight: bold;"> Duration: </span> <span class="duration">' + data.duration + "ns</span></span>",
      '<span class="attr"> <span style="font-weight: bold;"> Return: </span> <span class="return">' + data.return_value + "</span></span>",
    ]
    // ToDo: parameters and globals
    div.outerHTML = result.join("<br>") + "<br><br>"
  }

  private createMarker(name: string, cls: string, fill: string) {
    this.svg.append("svg:defs").selectAll("marker")
      .data([name])
      .enter().append("svg:marker")
      .attr("id", this.graphId + "-" + name)
      .attr("viewBox", "0 -5 10 10")
      .attr("refX", 10)
      .attr("refY", 0)
      .attr("markerWidth", 6)
      .attr("markerHeight", 6)
      .attr("orient", "auto")
      .append("svg:path")
      .classed(cls, true)
      .attr("fill", fill)
      .attr("d", "M0,-5L10,0L0,5");
  }

  private defaultNodeStroke(d: VisibleTrialNode) {
    let color = this.colors[d.data.trial_ids[0]];
    if (d.data.trial_ids.length > 1 || color == 0) {
      return "#000";
    }
    if (color == 1) {
      return "red";
    }
    return "green";
  }

  private nodeClick(d: VisibleTrialNode) {
    if (d.children) {
      d._children = d.children;
      delete d.children;
    } else {
      d.children = d._children;
      delete d._children;
    }
    this.update(d);
  }

  private updateNodes(source: VisibleTrialNode, node: any) {
    let self = this;
    var nodeEnter = node.enter().append('g')
      .attr("id", (d: VisibleTrialNode) => {
        return "node-" + this.graphId + "-" + d.data.index;
      })
      .attr('class', 'node')
      .attr("cursor", "pointer")
      .attr('transform', (d: VisibleTrialNode) => {
        return "translate(" + source.x + "," + source.y + ")";
      })
      .on('click', (event: MouseEvent, d: VisibleTrialNode) => {
        let activations = d.data.activations;
        if (event.ctrlKey && Object.keys(activations).length > 1) {
          self.getFunctionDiff(activations, d.data.trial_ids);
        } else {
          this.nodeClick(d);
        }
      })
      .on('mouseover', function (event: MouseEvent, d: VisibleTrialNode) {
        if (self.config.useTooltip) {
          self.closeTooltip();
          if (d3_pointers(event)[0][0] < 10) {
            self.showTooltip(event, d.data, self.t1);
          } else {
            self.showTooltip(event, d.data, self.t2);
          }
        }
        self.config.customMouseOver(self, d);
        return false;
      }).on('mouseout', function (event: MouseEvent, d: VisibleTrialNode) {
        self.config.customMouseOut(self, d);
      })

    /* nodeEnter.attr("activations_ids", (d:VisibleTrialNode)=>{
      let activations = d.data.activations;
      let attrValue = "";
      for(let trial in activations){
        if(attrValue.length > 0) attrValue+= "/";
        attrValue += trial + "/";
        attrValue += activations[trial];
      }
      return attrValue;
    }); */

    // Circle for new nodes
    nodeEnter.append('rect')
      .attr('class', 'node')
      .attr('rx', 1e-6)
      .attr('ry', 1e-6)
      .attr('width', 1e-6)
      .attr('height', 1e-6)
      .attr("stroke", (d: VisibleTrialNode) => this.defaultNodeStroke(d))
      .attr("stroke-width", "3px")
      .attr("fill", (d: VisibleTrialNode) => {
        if (d.data.trial_ids.length == 1) {
          return this.calculateColor(d.data, this.t1);
        }
        var grad = this.svg.append("svg:defs")
          .append("linearGradient")
          .attr("id", "grad-" + this.graphId + "-" + d.data.index)
          .attr("x1", "100%")
          .attr("x2", "0%")
          .attr("y1", "0%")
          .attr("y2", "0%");
        grad.append("stop")
          .attr("offset", "50%")
          .attr("stop-color", this.calculateColor(d.data, this.t2));
        grad.append("stop")
          .attr("offset", "50%")
          .attr("stop-color", this.calculateColor(d.data, this.t1));

        return "url(#grad-" + this.graphId + "-" + d.data.index + ")";
      });

    // Text for new nodes
    nodeEnter.append('text')
      .attr("dy", ".35em")
      .attr("font-family", "sans-serif")
      .attr("font-size", this.config.fontSize + "px")
      .attr("pointer-events", "none")
      .attr("fill", "#000")
      .attr("y", 24)
      .attr("x", 10)
      .attr("text-anchor", "middle")
      .each(function (d: VisibleTrialNode) {
        const textLabel = d3_select(this);
        const name = d.data.name.split('<br>');
        if (name.length > 1) {
          textLabel.append("tspan")
            .attr("x", "10")
            .attr("dy", ".35em")
            .attr("font-weight", "bold")
            .text(name[0]);
          textLabel.append("tspan")
            .attr("x", "10")
            .attr("dy", "1em")
            .text(name[1]);
          textLabel.attr("class", "nowrap")
        } else {
          return textLabel.text(d.data.name);
        }
      });

    nodeEnter.append("path")
      .attr("stroke", "#000")
      .attr("d", function (d: VisibleTrialNode) {
        if (d.data.trial_ids.length > 1) {
          return "M10," + 0 +
            "L10," + 20;
        }
        return "M0,0L0,0";
      });

    // Update
    var nodeUpdate = nodeEnter.merge(node);

    // Transition to proper position
    nodeUpdate.transition()
      .duration(this.config.duration)
      .attr("transform", (d: VisibleTrialNode) => {
        let color = this.colors[d.data.trial_ids[0]];
        d.dy = 0;
        if (color == 1) {
          d.dy = -40;
        } else if (color == 2) {
          d.dy = 40;
        }
        return "translate(" + (d.x - 10) + "," + (d.y + d.dy - 10) + ")";
      });

    // Update the node attributes and style
    nodeUpdate.select('rect.node')
      .attr('width', 20)
      .attr('height', 20)
      .attr('rx', 20)
      .attr('ry', 20)
      .attr("rx", (d: VisibleTrialNode) => {
        return d._children ? 0 : 20;
      })
      .attr("ry", (d: VisibleTrialNode) => {
        return d._children ? 0 : 20;
      })
      .attr('cursor', 'pointer');

    // Remove exiting nodes
    var nodeExit = node.exit().transition()
      .duration(this.config.duration)
      .attr("transform", function (d: VisibleTrialNode) {
        return "translate(" + source.x + "," + source.y + ")";
      })
      .remove();

    // Reduce node rects size to 0 on exit
    nodeExit.select('rect')
      .attr('rx', 1e-6)
      .attr('ry', 1e-6)
      .attr('width', 1e-6)
      .attr('height', 1e-6);

    // Reduce opacity of labels on exit
    nodeExit.select('text')
      .style('fill-opacity', 1e-6);
  }

  private updateLinks(source: VisibleTrialNode, edges: VisibleTrialEdge[]) {
    var link = this.g.selectAll<SVGPathElement, VisibleTrialEdge[]>('path.link')
      .data(edges, (d: VisibleTrialEdge) => d.id);

    // Enter any new links at the parent's previous position.
    var linkEnter = link.enter().insert('path', "g")
      .attr("class", "link")
      .attr("id", (d: VisibleTrialEdge, i: number) => {
        return "pathId-" + this.graphId + "-" + d.id;
      })
      .attr("fill", "none")
      .attr("stroke-width", "1.5px")
      .attr('d', (d: VisibleTrialEdge) => {
        var o = { y: source.y0, x: source.x0 }
        if (d.source.dy == undefined) {
          d.source.dy = 0;
        }
        if (d.target.dy == undefined) {
          d.target.dy = 0;
        }

        let
          ox = source.x0 || 0,
          oy = source.y0 || 0,
          x1 = d.source.x,
          y1 = d.source.y + d.source.dy,
          x2 = d.target.x,
          y2 = d.target.y + d.target.dy,
          dx = x2 - x1,
          dy = y2 - y1;
        if (d.type === 'initial' || d.type === 'call' || d.type == 'return') {
          // Initial
          return diagonal(o, o)
        } else if (dx === 0 && dy === 0) {
          // Loop
          return `M ${ox}, ${oy}
            A 15,20
              -45,1,1
              ${ox + 5},${oy + 8}`;
        }
        //return diagonal(d.source, d.target);
        return diagonal(o, o)
      })
      .attr("marker-end", (d: VisibleTrialEdge) => {
        let count = 0;
        for (let trial_id in d.count) {
          if (trial_id == this.t1.toString()) {
            count += 1;
          }
          if (trial_id == this.t2.toString()) {
            count += 2;
          }
        }
        if (count == 0 || count == 3) { // Single trial or diff
          return "url(#" + this.graphId + "-end)";
        }
        if (count == 1) { // First trial
          return "url(#" + this.graphId + "-endbefore)";
        }
        if (count == 2) { // Second trial
          return "url(#" + this.graphId + "-endafter)";
        }
        return "";
      })
      .attr('stroke', (d: VisibleTrialEdge) => {
        if (d.type === 'sequence') {
          return '#07F';
        }
        return '#666';
      })
      .attr('stroke-dasharray', (d: VisibleTrialEdge) => {
        if (d.type === 'return') {
          return '10,2';
        }
        return 'none';
      });

    // UPDATE
    var linkUpdate = linkEnter.merge(link)
    // Transition back to the parent element position
    linkUpdate.transition()
      .duration(this.config.duration)
      .attr('d', (d: VisibleTrialEdge) => {
        if (d.source.dy == undefined) {
          d.source.dy = 0;
        }
        if (d.target.dy == undefined) {
          d.target.dy = 0;
        }

        let
          sd = d.source.data,
          td = d.target.data,
          x1 = d.source.x,
          y1 = d.source.y + d.source.dy,
          x2 = d.target.x,
          y2 = d.target.y + d.target.dy,
          dx = x2 - x1,
          dy = y2 - y1,
          theta = Math.atan(dx / dy),
          phi = Math.atan(dy / dx),
          r = 10 + 2,
          sin_theta = r * Math.sin(theta),
          cos_theta = r * Math.cos(theta),
          sin_phi = r * Math.sin(phi),
          cos_phi = r * Math.cos(phi),
          m1 = (y2 > y1) ? 1 : -1,
          m2 = (x2 > x1) ? -1 : 1;
        if (d.type === 'initial') {
          // Initial
          return `M ${(x2 - 20)},${(y2 - 20)}
            L ${(x2 - r / 2.0)},${(y2 - r / 2.0)}`;
        } else if (d.type === 'call' || d.type == 'return') {
          // Call/Return
          x1 += m1 * sin_theta;
          x2 += m2 * cos_phi;
          y1 += m1 * cos_theta;
          y2 += m2 * sin_phi;
          if (dx === 0) {
            if (y1 > y2) {
              //y1 -= 10
              y2 += 20
            } else {
              //y1 += 10
              y2 -= 20
            }
          }
          return `M ${x1}, ${y1}
            L ${x2}, ${y2}`;
        } else if (dx === 0 && dy === 0) {
          // Loop
          return `M ${x1}, ${y1}
            A 15,20
              -45,1,1
              ${x2 + 5},${y2 + 8}`;
        } else if (sd.parent_index == td.parent_index) {
          // Same caller
          if (dy === 0 && sd.children_index == td.children_index - 1) {
            // Immediate sequence
            return `M ${x1}, ${y1}
              L ${(x2 + m2 * cos_phi)}, ${y2}`;
          } else {
            let sign = -1;
            if (y1 < y2) {
              x1 += m1 * sin_theta;
              y1 += m1 * cos_theta;
              y2 -= r;
              sign = -1;
            } else if (y2 < y1) {
              x1 += m1 * sin_theta;
              y1 += m1 * cos_theta;
              y2 += r;
              sign = 1;
            } else if (x1 >= x2) {
              y1 += r;
              y2 += r;
              sign = 2;
            } else {
              y1 -= r;
              y2 -= r;
              sign = -1;
            }
            return `M ${x1}, ${y1}
                C ${(x1 + x2) / 2} ${y1 + r * sign},
              ${(x1 + x2) / 2} ${y2 + r * sign},
              ${x2} ${y2}`;
          }
        }
        // Other caller
        x1 += m1 * sin_theta;
        y1 += m1 * cos_theta;
        x2 += m2 * cos_phi;
        y2 += m2 * sin_phi;
        return `M ${x1} ${y1}
            C ${(x1 + x2) / 2} ${y1},
              ${(x1 + x2) / 2} ${y2},
              ${x2} ${y2}`
      });
    // Remove any exiting links
    link.exit()//.transition()
      .attr('d', function (d: VisibleTrialEdge) {
        return diagonal(d.source, d.target)
      })
      .remove();  // linkExit
  }

  private updateLinkLabels(edges: VisibleTrialEdge[]) {
    var labelPath = this.g.selectAll<SVGTextPathElement, VisibleTrialEdge>(".label_text")
      .data(edges, (d: VisibleTrialEdge) => d.id);

    var labelEnter = labelPath.enter().append("text")
      .attr("class", "label_text")
      .attr("font-family", "sans-serif")
      .attr("font-size", this.config.labelFontSize + "px")
      .attr("pointer-events", "none")
      .attr("fill", "#000")
      .attr("text-anchor", "middle")
      .attr("dx", (d: VisibleTrialEdge) => {
        if (d.source.x == d.target.x) {
          return 29;
        }
        return (Math.abs(d.source.x - d.target.x) - 10) / 2;
      })
      .attr("dy", -3)
      .attr("id", (d: VisibleTrialEdge, i: number) => {
        return "pathlabel-" + this.graphId + "-" + d.id;
      })
      .append("textPath")
      .attr("xlink:href", (d: VisibleTrialEdge, i: number) => {
        return "#pathId-" + this.graphId + "-" + d.id;
      })
      .text((d: VisibleTrialEdge) => {
        if (d.type === 'initial') {
          return '';
        }
        if (this.t1 == this.t2 || !d.count[this.t2]) {
          return d.count[this.t1].toString();
        } else if (!d.count[this.t1]) {
          return d.count[this.t2].toString();
        }
        return d.count[this.t1] + ', ' + d.count[this.t2];
      });

    labelEnter.merge(labelPath)

    labelPath.exit().remove();
  }

  private zoomFunction(event: D3ZoomEvent<SVGSVGElement, any>) {
    this.closeTooltip();
    this.transform = event.transform;
    this.g.attr("transform", event.transform as any);
  }

  private _graphId(): string {
    return "trial-graph-" + this.graphId;
  }

}
