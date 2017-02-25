;(function ( $, window, document, undefined ) {
    "use strict";

    var pluginName = 'BalancedGallery',
        balancedGallery,
        defaults = {
            autoResize: true,
            background: null,
            idealHeight: null,
            idealWidth: null,
            maintainOrder: true,
            orientation: 'horizontal',
            padding: 5,
            shuffleUnorderedPartitions: true,
            divisor: 4
        },
        resizeTimeout = null,
        RADIX = 10,
        THRESHOLD = 1 - 0.00001,    //-0.00001 due to imprecision of floating values
        overflow = 0;

    //this wrapper prevents multiple instantiations of the plugin:
    $.fn[pluginName] = function ( options ) {
        return this.each(function () {
            if (!$.data(this, 'plugin_' + pluginName)) {
                $.data(this, 'plugin_' + pluginName, new BalancedGallery( this, options ));
            }
        });
    };

    function BalancedGallery( element, options ) {
        balancedGallery = this; // for contexts when 'this' doesn't refer to the BalancedGallery class.
        this.element = element;
        $(this.element).wrapInner('<div class="balanced-gallery-container"></div>');
        this.container = $(this.element).children()[0];
        this.elementChildren = $(this.container).children('img');
        this.options = $.extend( {}, defaults, options); // merge arg options and defaults
        this.options.orientation = (this.options.orientation).toLowerCase();

        if(this.options.autoResize) {
            this.unadulteratedCSS = {width: $(this.element)[0].style.width};
            this.unadulteratedOptions = $.extend({}, this.options);
            setupAutoResize();
        }

        this.quickResize = false;
        this.init();
        this.createGallery();
    }

    function setupAutoResize() {
        $(window).resize(function() {
            clearTimeout(resizeTimeout);

            resizeTimeout = setTimeout(function() {
                balancedGallery.recreate();
            }, 500);
        });
    }

    BalancedGallery.prototype.recreate = function () {
        this.options = $.extend({}, this.unadulteratedOptions);
        $(this.element).css(this.unadulteratedCSS); //used to reset width so it's calculated from browser

        balancedGallery.quickResize = true;
        balancedGallery.init();
        balancedGallery.createGallery();
    };

    BalancedGallery.prototype.init = function () {

        if(balancedGallery.quickResize === false) {
            this.elementChildren.each(function() {
                $(this).css({display: 'inline-block', padding: 0, margin: 0});
            });

            var padding = this.options.padding + 'px';
            $(this.container).css({fontSize: 0, paddingTop: padding, paddingLeft: padding});

            if(this.options.background !== null) {
                $(this.container).css({background: this.options.background});
            }
        }

        this.options.viewportWidth = $(this.element).width() - this.options.padding;

        if(this.options.idealWidth === null) {
            this.options.idealWidth = this.options.viewportWidth / this.options.divisor;
        }

        if(this.options.idealHeight === null) {
            this.options.idealHeight = this.options.viewportWidth / this.options.divisor;
        }

        //setting explicit width prevents image wrapping on resizing
        $(this.container).width(this.options.viewportWidth);
    };

    BalancedGallery.prototype.createGallery = function() {
        var orientation = this.options.orientation;
        if(orientation === 'horizontal') {
            createHorizontalGallery();
        } else if(orientation === 'vertical') {
            createVerticalGallery();
        } else {
            throw("BalancedGallery: Invalid Orientation.");
        }
    };

    function createHorizontalGallery() {
        var rows, weights, partitions;
        if(balancedGallery.quickResize) {
            quickResizeHorizontal();
        } else {
            rows = getRows();
            weights = getWidthWeights();
            partitions = getPartitions(weights, rows);
            resizeHorizontalElements(partitions);
        }
    }

    function createVerticalGallery() {
        var cols, weights, partitions;
        if(balancedGallery.quickResize) {
            quickResizeVertical();
        } else {
            cols = getColumns();
            weights = getHeightWeights();
            partitions = getPartitions(weights, cols);
            orientElementsVertically(partitions);
            resizeVerticalElements(partitions);
        }
    }

    function getRows () {
        var rows = Math.round(collectiveIdealWidth() / balancedGallery.options.viewportWidth);
        if(rows > 0 && rows < 1) { // if it's BETWEEN 0 and 1 means there is at least one image
            rows = 1;
        }
        return rows;
    }

    function getColumns() {
        var cols = Math.round(balancedGallery.options.viewportWidth / balancedGallery.options.idealWidth);
        var elements = balancedGallery.elementChildren.length;
        if(cols <= elements) {
            return cols;
        } else {
            return elements;
        }
    }

    function collectiveIdealWidth() {
        var sum = 0;
        balancedGallery.elementChildren.each(function () {
            sum += idealWidth($(this));
        });
        return sum;
    }

    function idealWidth($image) {
        return (aspectRatio($image) * balancedGallery.options.idealHeight) + balancedGallery.options.padding;
    }

    function getWidthWeights() {
        return balancedGallery.elementChildren.map(function () {
            var weight = aspectRatio($(this));
            return {element: this, weight: weight };
        });
    }

    function getHeightWeights() {
        return balancedGallery.elementChildren.map(function () {
            var weight = 1/aspectRatio($(this));
            return {element: this, weight: weight };
        });
    }

    function getPartitions(weights, sections) {
        if(balancedGallery.options.maintainOrder) {
            return getOrderedPartition(weights, sections);
        } else {
            var partitions = getUnorderedPartition(weights, sections);
            if(balancedGallery.options.shuffleUnorderedPartitions) {
                partitions = shufflePartitions(partitions);
            }
            reorderElements(partitions);
            return partitions;
        }
    }

    function getOrderedPartition(weights, sections) {
        var elementCount = weights.length;

        if(sections <= 0) {
            return [];
        }

        var solution  = createSolutionTable(weights, sections);
        elementCount -= 1;
        sections -= 2;
        var partitions = [];
        var results = [];

        while(sections >= 0) {
            results = [];
            for(var f = (solution[elementCount-1][sections]+1); f < elementCount+1; f++){
                results.push(weights[f]);
            }
            partitions = [results].concat(partitions);

            elementCount = solution[elementCount-1][sections];
            sections -= 1;
        }

        var results2 = [];
        for(var r = 0; r < elementCount+1; r++) {
            results2.push(weights[r]);
        }
        return [results2].concat(partitions);
    }

    // Used as part of the ordered partition function:
    function createSolutionTable(weights, sections) {
        var elementCount = weights.length;

        var table = [];
        for(var i = 0; i < elementCount; i++) {
            var res = [];
            for (var j = 0; j < sections; j++) {
                res.push(0);
            }
            table.push(res);
        }

        var solution = [];
        for(var k = 0; k < elementCount-1; k++) {
            var res2 = [];
            for (var l = 0; l < sections-1; l++) {
                res2.push(0);
            }
            solution.push(res2);
        }

        for(var m = 0; m < elementCount; m++) {
            table[m][0] = weights[m].weight + (m !== 0 ? table[m-1][0] : 0);
        }
        for(var n = 0; n < sections; n++) {
            table[0][n] = weights[0].weight;
        }

        var subArraySort = function(a, b){ return a[0]-b[0]; };
        for(var p = 1; p < elementCount; p++) {
            for(var q = 1; q < sections; q++) {
                var results = [];
                for (var r = 0; r < p; r++) {
                    results.push([ Math.max( table[r][q - 1], table[p][0]-table[r][0] ), r ]);
                }
                var arr = results.sort(subArraySort)[0];
                table[p][q] = arr[0];
                solution[p-1][q-1] = arr[1];
            }
        }

        return solution;
    }

    function getUnorderedPartition(weights, sections) {
        var sortedWeights = weights.sort(function(a,b){ return b.weight - a.weight; });

        var partitions = new Array(sections);
        for (var i=0; i < sections; i++) { partitions[i] = []; }


        for(var j = 0; j < sortedWeights.length; j++) {
            var shortestPartition = partitions[0];
            var shortestPartitionWeight = getPartitionWeight(shortestPartition);

            for(var k = 0; k < partitions.length; k++) {
                var pWeight = getPartitionWeight(partitions[k]);
                if(pWeight < shortestPartitionWeight) {
                    shortestPartition = partitions[k];
                    shortestPartitionWeight = pWeight;
                }
            }
            shortestPartition.push(sortedWeights[j]);
        }

        return partitions;
    }

    function getPartitionWeight(partition) {
        var weight = 0;
        $.each(partition, function(index, value) {
            weight += value.weight;
        });
        return weight;
    }

    function shufflePartitions(partitions) {
        for(var i = 0; i < partitions.length; i++) {
            partitions[i] = shuffleArray(partitions[i]);
        }
        return shuffleArray(partitions);
    }

    function reorderElements(partitions) {
        $(balancedGallery.container).html(''); //remove all elements
        for(var i = 0; i < partitions.length; i++) {
            var subPartition = partitions[i];
            for(var j = 0; j < subPartition.length; j++) {
                $(balancedGallery.container).append(subPartition[j].element);
            }
        }
    }

    function resizeHorizontalElements(partitions) {
        var padding = balancedGallery.options.padding;
        var index = 0;
        balancedGallery.resizingValue = [];

        for(var i = 0; i < partitions.length; i++) {
            var rowRatio = 0;
            for(var j = 0; j < partitions[i].length; j++) {
                rowRatio += partitions[i][j].weight;
            }
            balancedGallery.resizingValue[i] = {ratio: rowRatio, length: partitions[i].length};
            overflow = 0;
            var rowPadding = padding * partitions[i].length;
            var rawImgHeight = (balancedGallery.options.viewportWidth - rowPadding) / rowRatio;
            for(var k = 0; k < partitions[i].length; k++) {
                var $image = $(partitions[i][k].element);
                balancedGallery.elementChildren[index++] = $image;
                var imgHeight = parseInt(rawImgHeight, RADIX);
                var imgWidth = rawImgHeight * aspectRatio($image);
                imgWidth = checkWidthOverflow(imgWidth);
                $image.width(imgWidth);
                $image.height(imgHeight);
                $image.css({margin: 0, marginRight: padding+'px', marginBottom: padding+'px'});
            }
        }

        checkWidth(balancedGallery.options.orientation);
    }

    function quickResizeHorizontal() {
        var padding = balancedGallery.options.padding;
        var index = 0;
        var imagesPerRow = 0;
        var rawImgHeight, rowPadding;

        for(var i = 0; i < balancedGallery.elementChildren.length; i++) {
            if(i == imagesPerRow) {
                rowPadding = padding * balancedGallery.resizingValue[index].length;
                rawImgHeight = (balancedGallery.options.viewportWidth - rowPadding) / balancedGallery.resizingValue[index].ratio;
                imagesPerRow += balancedGallery.resizingValue[index].length;
                index++;
                overflow = 0;
            }
            var $image = balancedGallery.elementChildren[i];
            var imgHeight = parseInt(rawImgHeight, RADIX);
            var imgWidth = rawImgHeight * aspectRatio($image);
            imgWidth = checkWidthOverflow(imgWidth);
            $image.width(imgWidth);
            $image.height(imgHeight);
        }

        checkWidth(balancedGallery.options.orientation);
    }

    function resizeVerticalElements(partitions) {
        var padding = balancedGallery.options.padding;
        var columnRatio = [];
        var summedColRatios = 0;
        var index = 0;
        balancedGallery.resizingValue = [];
        overflow = 0;

        for(var i = 0; i < partitions.length; i++) {
            columnRatio[i] = 0;
            for(var j = 0; j < partitions[i].length; j++) {
                columnRatio[i] += partitions[i][j].weight;
            }
            // also add ratios from padding bars between each image in a column
            columnRatio[i] += partitions[i].length * (padding / balancedGallery.options.idealWidth);
            summedColRatios += columnRatio[i];
        }
        balancedGallery.summedColRatios = summedColRatios;
        var average = summedColRatios / partitions.length;
        for(var k = 0; k < partitions.length; k++) {
            var diffToAverage = average - columnRatio[k];
            var resizingFactor = average + diffToAverage;
            var columnWidth = (balancedGallery.options.viewportWidth / summedColRatios) * resizingFactor;
            var rawImgWidth = columnWidth - padding;
            var imgWidth = checkWidthOverflow(rawImgWidth);
            var columnHeight = 0;
            for(var l = 0; l < partitions[k].length; l++) {
                var $image = $(partitions[k][l].element);
                balancedGallery.elementChildren[index++] = $image;
                var imgHeight = Math.round(rawImgWidth * (1/aspectRatio($image)));
                columnHeight += imgHeight + padding;
                $image.width(imgWidth);
                $image.height(imgHeight);
                $image.css({margin: 0, marginRight: padding+'px', marginBottom: padding+'px'});
            }
            balancedGallery.resizingValue[k] = {ratio: resizingFactor, length: partitions[k].length, columnHeight: columnHeight};
        }

        checkWidth(balancedGallery.options.orientation);
		alignColumnHeights();
    }

    function quickResizeVertical() {
        var padding = balancedGallery.options.padding;
        var index = -1;
        var imagesPerCol = 0;
        overflow = 0;
        var columnWidth, rawImgWidth, imgWidth;

        for(var i = 0; i < balancedGallery.elementChildren.length; i++) {
            if(i == imagesPerCol) {
                index++;
                balancedGallery.resizingValue[index].columnHeight = 0;
                columnWidth = (balancedGallery.options.viewportWidth / balancedGallery.summedColRatios) * balancedGallery.resizingValue[index].ratio;
                rawImgWidth = columnWidth - padding;
                imgWidth = checkWidthOverflow(rawImgWidth);
                imagesPerCol += balancedGallery.resizingValue[index].length;
            }
            var $image = balancedGallery.elementChildren[i];
            var imgHeight = parseInt(rawImgWidth * (1/aspectRatio($image)), RADIX);
            balancedGallery.resizingValue[index].columnHeight += imgHeight + padding;
            $image.width(imgWidth);
            $image.height(imgHeight);
        }

        checkWidth(balancedGallery.options.orientation);
		alignColumnHeights();
    }

    //ensures that the rows or all columns are as wide as the container width
    function checkWidthOverflow(width) {
        var parsedWidth = parseInt(width, RADIX);
        overflow += width - parsedWidth;
        if(overflow >= THRESHOLD) {
            parsedWidth += 1;
            overflow -= 1;
        }
        return parsedWidth;
    }

    //stretch or shrink image by image, pixel by pixel to get exact same column heights
    function alignColumnHeights() {
        var averageHeight = 0;
        var imagesPerCol = 0;
        for(var i = 0; i < balancedGallery.resizingValue.length; i++) {
            averageHeight += balancedGallery.resizingValue[i].columnHeight;
        }
        averageHeight = Math.round(averageHeight / balancedGallery.resizingValue.length);
        for(var j = 0; j < balancedGallery.resizingValue.length; j++) {
            imagesPerCol += balancedGallery.resizingValue[j].length;
            var counter = Math.sign(averageHeight - balancedGallery.resizingValue[j].columnHeight);
            //starting with last image in column, because it's more likely to be outside of the current viewport
            var k = imagesPerCol-1;
            while(averageHeight != balancedGallery.resizingValue[j].columnHeight) {
                balancedGallery.elementChildren[k].height(balancedGallery.elementChildren[k].height() + counter);
                balancedGallery.resizingValue[j].columnHeight += counter;
                k--;
				//if all images in a column got streched/shrinked, start iteration again with last image in column till averageHeight matches columnHeight
                if(k < (imagesPerCol - balancedGallery.resizingValue[j].length)) { 
                    k = imagesPerCol-1;
                }
            }
        }
    }
	
    //if a scrollbar appears or disappears after resizing
    function checkWidth(orientation) {
        if((balancedGallery.options.viewportWidth + balancedGallery.options.padding) !== $(balancedGallery.element).width()) {
            balancedGallery.options.viewportWidth = $(balancedGallery.element).width() - balancedGallery.options.padding;
            $(balancedGallery.container).width(balancedGallery.options.viewportWidth);
            if(orientation == 'horizontal') {
                quickResizeHorizontal();
            } else if(orientation == 'vertical') {
                quickResizeVertical();
            }
        }
    }

    function orientElementsVertically(partitions) {
        var $container = $(balancedGallery.container);
        $container.html(''); //clear the images

        for(var i = 0; i < partitions.length; i++) {
            var colName = 'balanced-gallery-col'+i;
            var column = '<div class="balanced-gallery-column" id="'+colName+'" style="float: left; padding: 0; margin: 0;"></div>';
            $container.append(column);
            var $col = $($container.find("div#"+colName));
            for(var j = 0; j < partitions[i].length; j++) {
                var child = partitions[i][j].element;
                $col.append(child).append('<br style="display: block;"/>'); //Fix for Firefox; without 'style="display: block;"' Firefox assigns a width for an <br>-element. Strange!
            }
        }

        //add clearing div
        var clearingDiv = '<div class="balanced-gallery-clearing" style="clear: both;"></div>';
        $container.append(clearingDiv);
    }

    function aspectRatio($image) {
        return $image[0].naturalWidth / $image[0].naturalHeight;
    }

    function shuffleArray(array) {
        var counter = array.length, temp, index;
        while (counter--) {
            index = (Math.random() * counter) | 0; //not a typo
            temp = array[counter];
            array[counter] = array[index];
            array[index] = temp;
        }
        return array;
    }

})( jQuery, window, document );