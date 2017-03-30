'use strict';

const Bucket = require('../bucket');
const util = require('../../util/util');
const Pbf = require('pbf');
const createVertexArrayType = require('../vertex_array_type');
const createElementArrayType = require('../element_array_type');
const createTerrainArrayType = require('../terrain_array_type');
const {DEMPyramid, Level} = require('../../geo/dem_pyramid');

// not sure if we need this.... :thinkingface:
const terrainInterface = {
    layoutVertexArrayType: createVertexArrayType([
        {name: 'a_pos',         components: 2, type: 'Int16'},
        {name: 'a_texture_pos', components: 2, type: 'Uint16'}
    ]),
    paintAttributes: [
        {property: 'terrain-shadow-color',          type: 'Uint8'},
        {property: 'terrain-highlight-color',       type: 'Uint8'},
        {property: 'terrain-accent-color',          type: 'Uint8'},
        {property: 'terrain-illumination-direction', type: 'Uint8'},
        {property: 'terrain-illumination-alignment', type: 'Uint8'},
        {property: 'terrain-exaggeration',          type: 'Uint8'}
    ],
    elementArrayType: createElementArrayType(),
    terrainArrayType: createTerrainArrayType()
};

class TerrainBucket extends Bucket {
    constructor(options) {
        super(options, terrainInterface);
        this.terrainPrepared = false;
    }

    encodeLevel(level) {
        const arrays = this.arrays;
        for (let i = 0; i < level.data.length; i++) {
            arrays.terrainArray.emplaceBack(level.data[i]);
        }

    }

    populate(features) {
        this.terrainTile = features[0];
        this.pyramid = this.getDEMPyramid();
        if (this.pyramid && this.pyramid.loaded) {
            for (let i = 0; i < this.pyramid.levels.length; i++) {
                this.encodeLevel(this.pyramid.levels[i]);
            }
        }
    }

    getDEMPyramid() {
        const pyramid = new DEMPyramid();
        if (this.terrainTile) {
            if (this.terrainTile.extent !== 256) {
                util.warnOnce("DEM extent must be 256");
                return this.terrainTile.pyramid;
            }
        }
        const pbf = new Pbf(this.terrainTile._pbf.buf);
        pbf.readFields((tag)=>{
            if (tag === 3 /* layers */) {
                var extent = 0;
                pbf.readMessage(function(tag) {
                    if (tag === 5 /* extent */) {
                        extent = pbf.readVarint();
                    } else if (tag === 2 /* feature */) {
                        var bytes, type;
                        pbf.readMessage(function(tag) {
                            if (tag == 3 /* type */) {
                                type = pbf.readVarint();
                            } else if (tag === 4 /* geometry */) {
                                bytes = pbf.readBytes();
                            }
                        });

                        if (type === 4) {
                            const pbfFeat = new Pbf(bytes);
                            // decode first level:
                            pyramid.levels.push(new Level(256, 256, 128));

                            const level = pyramid.levels[0];
                            for (let y = 0; y < level.height; y++) {
                                for (let x = 0; x < level.width; x++) {
                                    const value = pbfFeat.readSVarint();
                                    const valueLeft = x ? level.get(x - 1, y) : 0;
                                    const valueUp = y ? level.get(x, y - 1) : 0;
                                    const valueUpLeft = x && y ? level.get(x - 1, y - 1) : 0;
                                    level.set(x, y, value + valueLeft + valueUp - valueUpLeft);
                                }
                            }
                            pyramid.buildLevels();
                            pyramid.decodeBleed(pbfFeat);
                        }
                    }
                });
            }
        })


        pyramid.loaded = true;
        return pyramid;
    }

    isEmpty() {
        return false;
    }
}
module.exports = TerrainBucket;