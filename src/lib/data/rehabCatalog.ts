import type { RehabCatalog } from '$lib/domain/types';
import { slugify } from '$lib/domain/id';


// paste your raw JSON as RAW and map it ↓
const RAW = [
	{
		"Category": "Roof",
		"Items": [
			{
				"Description": "Roof(rip & replace)- archiectural shingle",
				"Unit": "psf",
				"Cost": 4,
				"userInput": "",
				"form_data_description": "roofrip__replace_architectural_shingle"
			},
			{
				"Description": "Rollover(add a layer of shingles)-architectural shingle",
				"Unit": "psf",
				"Cost": 2.5,
				"userInput": "",
				"form_data_description": "rolloveradd_a_layer_of_shinglesarchitectural_shingle"
			},
			{
				"Description": "Roof sheathing-plywood 1/2\" remove & install",
				"Unit": "psf",
				"Cost": 2,
				"userInput": "",
				"form_data_description": "roof_sheathingplywood_12_remove__install"
			},
			{
				"Description": "Roof repair/patch(hard)",
				"Unit": "ea",
				"Cost": 900,
				"userInput": "",
				"form_data_description": "roof_repairpatchhard"
			},
			{
				"Description": "Roof repair/patch(easy)",
				"Unit": "ea",
				"Cost": 600,
				"userInput": "",
				"form_data_description": "roof_repairpatcheasy"
			},
			{
				"Description": "Premium for 3 layer tear off",
				"Unit": "psf",
				"Cost": 0.35,
				"userInput": "",
				"form_data_description": "premium_for_3_layer_tear_off"
			},
			{
				"Description": "Premium for steep pitched roof",
				"Unit": "psf",
				"Cost": 0.2,
				"userInput": "",
				"form_data_description": "premium_for_steep_pitched_roof"
			},
			{
				"Description": "Fascia-demo & install new",
				"Unit": "lf",
				"Cost": 3,
				"userInput": "",
				"form_data_description": "fasciademo__install_new"
			},
			{
				"Description": "Soffit-demo & install new",
				"Unit": "lf",
				"Cost": 4,
				"userInput": "",
				"form_data_description": "soffitdemo__install_new"
			}
		]
	},
	{
		"Category": "Gutters",
		"Items": [
			{
				"Description": "Gutters & downspouts-demo & install new(flat cost)",
				"Unit": "sf",
				"Cost": 0.5,
				"userInput": "",
				"form_data_description": "gutters__downspoutsdemo__install_newflat_cost"
			},
			{
				"Description": "Gutters & downspouts-demo & install new(linear cost)",
				"Unit": "lf",
				"Cost": 6,
				"userInput": "",
				"form_data_description": "gutters__downspoutsdemo__install_newlinear_cost"
			}
		]
	},
	{
		"Category": "Siding",
		"Items": [
			{
				"Description": "Demo existing finishing material",
				"Unit": "psf",
				"Cost": 0.75,
				"userInput": "",
				"form_data_description": "demo_existing_finishing_material"
			},
			{
				"Description": "Stucco",
				"Unit": "psf",
				"Cost": 7,
				"userInput": "",
				"form_data_description": "stucco"
			},
			{
				"Description": "Wood siding",
				"Unit": "psf",
				"Cost": 6,
				"userInput": "",
				"form_data_description": "wood_siding"
			},
			{
				"Description": "Vinyl siding",
				"Unit": "psf",
				"Cost": 2.25,
				"userInput": "",
				"form_data_description": "vinyl_siding"
			},
			{
				"Description": "Fiber cement siding",
				"Unit": "psf",
				"Cost": 7,
				"userInput": "",
				"form_data_description": "fiber_cement_siding"
			},
			{
				"Description": "Plywood panel siding",
				"Unit": "psf",
				"Cost": 2.5,
				"userInput": "",
				"form_data_description": "plywood_panel_siding"
			},
			{
				"Description": "Patch an exterior section",
				"Unit": "lf",
				"Cost": 500,
				"userInput": "",
				"form_data_description": "patch_an_exterior_section"
			},
			{
				"Description": "Power wash exterior finish",
				"Unit": "psf",
				"Cost": 0.75,
				"userInput": "",
				"form_data_description": "power_wash_exterior_finish"
			}
		]
	},
	{
		"Category": "Masonry",
		"Items": [
			{
				"Description": "Fireplace/chimney/brick/stone-replace existing",
				"Unit": "ls",
				"Cost": 5000,
				"userInput": "",
				"form_data_description": "fireplacechimneybrickstonereplace_existing"
			},
			{
				"Description": "Concrete block",
				"Unit": "sf",
				"Cost": 6,
				"userInput": "",
				"form_data_description": "concrete_block"
			},
			{
				"Description": "Stone",
				"Unit": "sf",
				"Cost": 18,
				"userInput": "",
				"form_data_description": "stone"
			},
			{
				"Description": "Brick",
				"Unit": "sf",
				"Cost": 11.5,
				"userInput": "",
				"form_data_description": "brick"
			},
			{
				"Description": "Tuckpoint brick",
				"Unit": "sf",
				"Cost": 3.5,
				"userInput": "",
				"form_data_description": "tuckpoint_brick"
			},
			{
				"Description": "Power wash exterior masonry",
				"Unit": "sf",
				"Cost": 0.75,
				"userInput": "",
				"form_data_description": "power_wash_exterior_masonry"
			}
		]
	},
	{
		"Category": "Painting",
		"Items": [
			{
				"Description": "Painting both exterior & interior(whole property)",
				"Unit": "psf",
				"Cost": 3,
				"userInput": "",
				"form_data_description": "painting_both_exterior__interiorwhole_property"
			},
			{
				"Description": "Painting exterior only",
				"Unit": "psf",
				"Cost": 2,
				"userInput": "",
				"form_data_description": "painting_exterior_only"
			},
			{
				"Description": "Paint trim only",
				"Unit": "lf",
				"Cost": 1.65,
				"userInput": "",
				"form_data_description": "paint_trim_only"
			},
			{
				"Description": "Sand & refinish deck or paint deck",
				"Unit": "sf",
				"Cost": 1.75,
				"userInput": "",
				"form_data_description": "sand__refinish_deck_or_paint_deck"
			},
			{
				"Description": "Paint fence",
				"Unit": "sf",
				"Cost": 1,
				"userInput": "",
				"form_data_description": "paint_fence"
			},
			{
				"Description": "Detached garage",
				"Unit": "sf",
				"Cost": 1,
				"userInput": "",
				"form_data_description": "detached_garage"
			},
			{
				"Description": "Interior painting only",
				"Unit": "sf",
				"Cost": 2,
				"userInput": "",
				"form_data_description": "interior_painting_only"
			},
			{
				"Description": "Add extra wall prep(damaged walls)",
				"Unit": "sf",
				"Cost": 0.5,
				"userInput": "",
				"form_data_description": "add_extra_wall_prepdamaged_walls"
			}
		]
	},
	{
		"Category": "Windows",
		"Items": [
			{
				"Description": "Windows, vinyl, average size",
				"Unit": "ea",
				"Cost": 450,
				"userInput": "",
				"form_data_description": "windows_vinyl_average_size"
			},
			{
				"Description": "Windows,wood,restore existing wood(historical)",
				"Unit": "ea",
				"Cost": 550,
				"userInput": "",
				"form_data_description": "windowswoodrestore_existing_woodhistorical"
			},
			{
				"Description": "Windows, large bay window-remove & replace",
				"Unit": "ea",
				"Cost": 850,
				"userInput": "",
				"form_data_description": "windows_large_bay_windowremove__replace"
			}
		]
	},
	{
		"Category": "Garage",
		"Items": [
			{
				"Description": "Garage door only-1 car 9x7' door manual",
				"Unit": "ea",
				"Cost": 1154,
				"userInput": "",
				"form_data_description": "garage_door_only1_car_9x7_door_manual"
			},
			{
				"Description": "Garage door only- 2 - car 16' door manual",
				"Unit": "ea",
				"Cost": 1783,
				"userInput": "",
				"form_data_description": "garage_door_only_2__car_16_door_manual"
			},
			{
				"Description": "Garage door opener installed",
				"Unit": "ea",
				"Cost": 615,
				"userInput": "",
				"form_data_description": "garage_door_opener_installed"
			},
			{
				"Description": "Reroof detached garage(rip & replace)",
				"Unit": "sf",
				"Cost": 4,
				"userInput": "",
				"form_data_description": "reroof_detached_garagerip__replace"
			},
			{
				"Description": "Build new detached garage",
				"Unit": "sf",
				"Cost": 40,
				"userInput": "",
				"form_data_description": "build_new_detached_garage"
			}
		]
	},
	{
		"Category": "Landscaping",
		"Items": [
			{
				"Description": "Full landscaping makeover large lot",
				"Unit": "sf",
				"Cost": 5000,
				"userInput": "",
				"form_data_description": "full_landscaping_makeover_large_lot"
			},
			{
				"Description": "Full landscaping makeover medium lot",
				"Unit": "ls",
				"Cost": 3500,
				"userInput": "",
				"form_data_description": "full_landscaping_makeover_medium_lot"
			},
			{
				"Description": "Full landscaping makeover small lot",
				"Unit": "ls",
				"Cost": 2000,
				"userInput": "",
				"form_data_description": "full_landscaping_makeover_small_lot"
			},
			{
				"Description": "Clean up landscaping & yard only",
				"Unit": "ls",
				"Cost": 500,
				"userInput": "",
				"form_data_description": "clean_up_landscaping__yard_only"
			},
			{
				"Description": "Tree removal(per tree)",
				"Unit": "ea",
				"Cost": 500,
				"userInput": "",
				"form_data_description": "tree_removalper_tree"
			},
			{
				"Description": "Tree planting ",
				"Unit": "ea",
				"Cost": 130,
				"userInput": "",
				"form_data_description": "tree_planting_"
			}
		]
	},
	{
		"Category": "Concrete/Asphalt",
		"Items": [
			{
				"Description": "Demo existing concrete or asphalt",
				"Unit": "sf",
				"Cost": 2,
				"userInput": "",
				"form_data_description": "demo_existing_concrete_or_asphalt"
			},
			{
				"Description": "Concrete installed for driveway/patio/sidewalk",
				"Unit": "sf",
				"Cost": 7,
				"userInput": "",
				"form_data_description": "concrete_installed_for_drivewaypatiosidewalk"
			},
			{
				"Description": "Asphalt installed in driveway",
				"Unit": "sf",
				"Cost": 4,
				"userInput": "",
				"form_data_description": "asphalt_installed_in_driveway"
			},
			{
				"Description": "Gravel installed for driveway/sidewalk",
				"Unit": "sf",
				"Cost": 2,
				"userInput": "",
				"form_data_description": "gravel_installed_for_drivewaysidewalk"
			}
		]
	},
	{
		"Category": "Decks",
		"Items": [
			{
				"Description": "New deck 15'x15'(add permit if 30\" off ground)",
				"Unit": "ea",
				"Cost": 3000,
				"userInput": "",
				"form_data_description": "new_deck_15x15add_permit_if_30_off_ground"
			},
			{
				"Description": "New deck 10'x10'",
				"Unit": "ea",
				"Cost": 2000,
				"userInput": "",
				"form_data_description": "new_deck_10x10"
			},
			{
				"Description": "New deck-treated lumber",
				"Unit": "sf",
				"Cost": 15,
				"userInput": "",
				"form_data_description": "new_decktreated_lumber"
			},
			{
				"Description": "New deck-cedar material",
				"Unit": "sf",
				"Cost": 19,
				"userInput": "",
				"form_data_description": "new_deckcedar_material"
			},
			{
				"Description": "Decking material replacement only",
				"Unit": "sf",
				"Cost": 7,
				"userInput": "",
				"form_data_description": "decking_material_replacement_only"
			},
			{
				"Description": "Sand & refinish deck only",
				"Unit": "sf",
				"Cost": 2,
				"userInput": "",
				"form_data_description": "sand__refinish_deck_only"
			},
			{
				"Description": "New railings-wood",
				"Unit": "lf",
				"Cost": 20,
				"userInput": "",
				"form_data_description": "new_railingswood"
			},
			{
				"Description": "New railings-metal",
				"Unit": "lf",
				"Cost": 40,
				"userInput": "",
				"form_data_description": "new_railingsmetal"
			}
		]
	},
	{
		"Category": "Pergola",
		"Items": [
			{
				"Description": "New pergola canopy 15'x15'",
				"Unit": "ea",
				"Cost": 2500,
				"userInput": "",
				"form_data_description": "new_pergola_canopy_15x15"
			},
			{
				"Description": "New pergola canopy 10'x10'",
				"Unit": "ea",
				"Cost": 2000,
				"userInput": "",
				"form_data_description": "new_pergola_canopy_10x10"
			}
		]
	},
	{
		"Category": "Fence",
		"Items": [
			{
				"Description": "Wood fencing",
				"Unit": "lf",
				"Cost": 53,
				"userInput": "",
				"form_data_description": "wood_fencing"
			},
			{
				"Description": "Wrought iron fencing",
				"Unit": "lf",
				"Cost": 90,
				"userInput": "",
				"form_data_description": "wrought_iron_fencing"
			},
			{
				"Description": "Chain-link fencing",
				"Unit": "lf",
				"Cost": 18,
				"userInput": "",
				"form_data_description": "chainlink_fencing"
			}
		]
	},
	{
		"Category": "Pool",
		"Items": [
			{
				"Description": "Pool completely redone($10k to 15k)",
				"Unit": "ea",
				"Cost": 10000,
				"userInput": "",
				"form_data_description": "pool_completely_redone10k_to_15k"
			},
			{
				"Description": "Pool(redo plaster only)",
				"Unit": "ea",
				"Cost": 4500,
				"userInput": "",
				"form_data_description": "poolredo_plaster_only"
			}
		]
	},
	{
		"Category": "Septic",
		"Items": [
			{
				"Description": "Septic(all new system)",
				"Unit": "ea",
				"Cost": 15000,
				"userInput": "",
				"form_data_description": "septicall_new_system"
			},
			{
				"Description": "Septic(new tank only)",
				"Unit": "ea",
				"Cost": 5500,
				"userInput": "",
				"form_data_description": "septicnew_tank_only"
			},
			{
				"Description": "Septic(replace leach field only)",
				"Unit": "ea",
				"Cost": 3000,
				"userInput": "",
				"form_data_description": "septicreplace_leach_field_only"
			}
		]
	},
	{
		"Category": "Flooring",
		"Items": [
			{
				"Description": "Hardwood flooring-solid wood",
				"Unit": "sf",
				"Cost": 8,
				"userInput": "",
				"form_data_description": "hardwood_flooringsolid_wood"
			},
			{
				"Description": "Engineered hardwood flooring",
				"Unit": "sf",
				"Cost": 7,
				"userInput": "",
				"form_data_description": "engineered_hardwood_flooring"
			},
			{
				"Description": "Laminate hardwood flooring",
				"Unit": "sf",
				"Cost": 5,
				"userInput": "",
				"form_data_description": "laminate_hardwood_flooring"
			},
			{
				"Description": "Sand & refinish existing hardwood flooring",
				"Unit": "sf",
				"Cost": 3,
				"userInput": "",
				"form_data_description": "sand__refinish_existing_hardwood_flooring"
			},
			{
				"Description": "Carpet",
				"Unit": "sf",
				"Cost": 3,
				"userInput": "",
				"form_data_description": "carpet"
			},
			{
				"Description": "Vinyl or linoleum flooring",
				"Unit": "sf",
				"Cost": 5,
				"userInput": "",
				"form_data_description": "vinyl_or_linoleum_flooring"
			}
		]
	},
	{
		"Category": "Tile",
		"Items": [
			{
				"Description": "Cermamic floor tile- in kitchen",
				"Unit": "sf",
				"Cost": 10,
				"userInput": "",
				"form_data_description": "cermamic_floor_tile_in_kitchen"
			},
			{
				"Description": "Backsplash wall tile-in kitchen",
				"Unit": "sf",
				"Cost": 15,
				"userInput": "",
				"form_data_description": "backsplash_wall_tilein_kitchen"
			},
			{
				"Description": "Cermamic floor tile- in bathrooms",
				"Unit": "sf",
				"Cost": 8,
				"userInput": "",
				"form_data_description": "cermamic_floor_tile_in_bathrooms"
			},
			{
				"Description": "Shower wall tile- in bathrooms(70 sf usually)",
				"Unit": "sf",
				"Cost": 9,
				"userInput": "",
				"form_data_description": "shower_wall_tile_in_bathrooms70_sf_usually"
			},
			{
				"Description": "Shower accent wall tile-in bathrooms",
				"Unit": "sf",
				"Cost": 16,
				"userInput": "",
				"form_data_description": "shower_accent_wall_tilein_bathrooms"
			},
			{
				"Description": "Ceramic floor tile-other areas of house",
				"Unit": "sf",
				"Cost": 8,
				"userInput": "",
				"form_data_description": "ceramic_floor_tileother_areas_of_house"
			}
		]
	},
	{
		"Category": "Bulk Kitchen ",
		"Items": [
			{
				"Description": "High end kitchen",
				"Unit": "ea",
				"Cost": 12500,
				"userInput": "",
				"form_data_description": "high_end_kitchen"
			},
			{
				"Description": "Median kitchen",
				"Unit": "ea",
				"Cost": 10500,
				"userInput": "",
				"form_data_description": "median_kitchen"
			},
			{
				"Description": "Low end kitchen",
				"Unit": "ea",
				"Cost": 8500,
				"userInput": "",
				"form_data_description": "low_end_kitchen"
			}
		]
	},
	{
		"Category": "Kitchen",
		"Items": [
			{
				"Description": "Low end kitchen- refinish existing cabinets",
				"Unit": "ea",
				"Cost": 6500,
				"userInput": "",
				"form_data_description": "low_end_kitchen_refinish_existing_cabinets"
			},
			{
				"Description": "Kitchen extra custom items",
				"Unit": "ea",
				"Cost": 500,
				"userInput": "",
				"form_data_description": "kitchen_extra_custom_items"
			},
			{
				"Description": "Cabinets",
				"Unit": "lf",
				"Cost": 185,
				"userInput": "",
				"form_data_description": "cabinets"
			},
			{
				"Description": "Countertops",
				"Unit": "sf",
				"Cost": 65,
				"userInput": "",
				"form_data_description": "countertops"
			},
			{
				"Description": "Sink",
				"Unit": "ea",
				"Cost": 350,
				"userInput": "",
				"form_data_description": "sink"
			},
			{
				"Description": "Sink faucet",
				"Unit": "ea",
				"Cost": 350,
				"userInput": "",
				"form_data_description": "sink_faucet"
			},
			{
				"Description": "Garbage disposal",
				"Unit": "ea",
				"Cost": 250,
				"userInput": "",
				"form_data_description": "garbage_disposal"
			},
			{
				"Description": "Refrigerator",
				"Unit": "ea",
				"Cost": 1200,
				"userInput": "",
				"form_data_description": "refrigerator"
			},
			{
				"Description": "Range",
				"Unit": "ea",
				"Cost": 850,
				"userInput": "",
				"form_data_description": "range"
			},
			{
				"Description": "Range hood",
				"Unit": "ea",
				"Cost": 400,
				"userInput": "",
				"form_data_description": "range_hood"
			},
			{
				"Description": "Dishwasher",
				"Unit": "ea",
				"Cost": 600,
				"userInput": "",
				"form_data_description": "dishwasher"
			},
			{
				"Description": "Microwave",
				"Unit": "ea",
				"Cost": 350,
				"userInput": "",
				"form_data_description": "microwave"
			}
		]
	},
	{
		"Category": "Kitchen Appliances",
		"Items": [
			{
				"Description": "Luxury home appliances",
				"Unit": "ea",
				"Cost": 12000,
				"userInput": "",
				"form_data_description": "luxury_home_appliances"
			},
			{
				"Description": "High end home appliances",
				"Unit": "ea",
				"Cost": 7000,
				"userInput": "",
				"form_data_description": "high_end_home_appliances"
			},
			{
				"Description": "Median end home appliances",
				"Unit": "ea",
				"Cost": 4500,
				"userInput": "",
				"form_data_description": "median_end_home_appliances"
			},
			{
				"Description": "Low end home appliances",
				"Unit": "ea",
				"Cost": 2000,
				"userInput": "",
				"form_data_description": "low_end_home_appliances"
			}
		]
	},
	{
		"Category": "Bathroom(grouped)",
		"Items": [
			{
				"Description": "Large master bath-replace everything",
				"Unit": "ea",
				"Cost": 9000,
				"userInput": "",
				"form_data_description": "large_master_bathreplace_everything"
			},
			{
				"Description": "Full bath-replace everything",
				"Unit": "ea",
				"Cost": 5500,
				"userInput": "",
				"form_data_description": "full_bathreplace_everything"
			},
			{
				"Description": "Half bath-replace everything",
				"Unit": "ea",
				"Cost": 3000,
				"userInput": "",
				"form_data_description": "half_bathreplace_everything"
			}
		]
	},
	{
		"Category": "Bathroom",
		"Items": [
			{
				"Description": "Vanity cabinet",
				"Unit": "ea",
				"Cost": 700,
				"userInput": "",
				"form_data_description": "vanity_cabinet"
			},
			{
				"Description": "Vanity countertop-granite or other hard surface",
				"Unit": "ea",
				"Cost": 150,
				"userInput": "",
				"form_data_description": "vanity_countertopgranite_or_other_hard_surface"
			},
			{
				"Description": "Vanity mirror",
				"Unit": "ea",
				"Cost": 75,
				"userInput": "",
				"form_data_description": "vanity_mirror"
			},
			{
				"Description": "Sink",
				"Unit": "ea",
				"Cost": 125,
				"userInput": "",
				"form_data_description": "sink"
			},
			{
				"Description": "Sink faucet",
				"Unit": "ea",
				"Cost": 150,
				"userInput": "",
				"form_data_description": "sink_faucet"
			},
			{
				"Description": "Toilet",
				"Unit": "ea",
				"Cost": 200,
				"userInput": "",
				"form_data_description": "toilet"
			},
			{
				"Description": "Bathtub-fiberglass",
				"Unit": "ea",
				"Cost": 450,
				"userInput": "",
				"form_data_description": "bathtubfiberglass"
			},
			{
				"Description": "Bathtub & shower surround-fiberglass",
				"Unit": "ea",
				"Cost": 500,
				"userInput": "",
				"form_data_description": "bathtub__shower_surroundfiberglass"
			},
			{
				"Description": "Shower stall & surround-fiberglass",
				"Unit": "ea",
				"Cost": 400,
				"userInput": "",
				"form_data_description": "shower_stall__surroundfiberglass"
			},
			{
				"Description": "Showerhead & faucet kit",
				"Unit": "ea",
				"Cost": 210,
				"userInput": "",
				"form_data_description": "showerhead__faucet_kit"
			},
			{
				"Description": "Bathroom towel bar kit",
				"Unit": "ea",
				"Cost": 75,
				"userInput": "",
				"form_data_description": "bathroom_towel_bar_kit"
			}
		]
	},
	{
		"Category": "Framing",
		"Items": [
			{
				"Description": "New construction framing-(includes walls, floors & roof)",
				"Unit": "sf",
				"Cost": 30,
				"userInput": "",
				"form_data_description": "new_construction_framingincludes_walls_floors__roof"
			},
			{
				"Description": "Interior framing changes(non load barring)",
				"Unit": "sf",
				"Cost": 6,
				"userInput": "",
				"form_data_description": "interior_framing_changesnon_load_barring"
			},
			{
				"Description": "Open load bearing/structural wall(per 8' span)",
				"Unit": "ea",
				"Cost": 1500,
				"userInput": "",
				"form_data_description": "open_load_bearingstructural_wallper_8_span"
			},
			{
				"Description": "Replace stairs",
				"Unit": "ea",
				"Cost": 1000,
				"userInput": "",
				"form_data_description": "replace_stairs"
			}
		]
	},
	{
		"Category": "Subfloor",
		"Items": [
			{
				"Description": "Subfloor put in (3/4\" plywood)",
				"Unit": "sf",
				"Cost": 1.85,
				"userInput": "",
				"form_data_description": "subfloor_put_in_34_plywood"
			}
		]
	},
	{
		"Category": "Insulation",
		"Items": [
			{
				"Description": "Wall insulation",
				"Unit": "sf",
				"Cost": 1,
				"userInput": "",
				"form_data_description": "wall_insulation"
			},
			{
				"Description": "Floor insulation",
				"Unit": "sf",
				"Cost": 1.25,
				"userInput": "",
				"form_data_description": "floor_insulation"
			},
			{
				"Description": "Attic insulation, blown-in",
				"Unit": "sf",
				"Cost": 0.8,
				"userInput": "",
				"form_data_description": "attic_insulation_blownin"
			}
		]
	},
	{
		"Category": "Walls",
		"Items": [
			{
				"Description": "Drywall,tape & skimcoat walls/ceilings in gutted house",
				"Unit": "sf",
				"Cost": 6,
				"userInput": "",
				"form_data_description": "drywalltape__skimcoat_wallsceilings_in_gutted_house"
			},
			{
				"Description": "Drywall,tape, & skimcoat of a wall(1/2\" thick)",
				"Unit": "sf",
				"Cost": 2.5,
				"userInput": "",
				"form_data_description": "drywalltape__skimcoat_of_a_wall12_thick"
			},
			{
				"Description": "Drywall,tape, & skimcoat of a ceiling(1/2\" thick)",
				"Unit": "sf",
				"Cost": 4,
				"userInput": "",
				"form_data_description": "drywalltape__skimcoat_of_a_ceiling12_thick"
			},
			{
				"Description": "Skimcoating/texturing walls & ceilings only",
				"Unit": "sf",
				"Cost": 1,
				"userInput": "",
				"form_data_description": "skimcoatingtexturing_walls__ceilings_only"
			},
			{
				"Description": "Patchwork section of a wall-drywall, tape, & finish",
				"Unit": "ea",
				"Cost": 500,
				"userInput": "",
				"form_data_description": "patchwork_section_of_a_walldrywall_tape__finish"
			},
			{
				"Description": "Remove popcorn ceilings",
				"Unit": "sf",
				"Cost": 1,
				"userInput": "",
				"form_data_description": "remove_popcorn_ceilings"
			}
		]
	},
	{
		"Category": "Door & Trim Bulk",
		"Items": [
			{
				"Description": "New interior doors, closet doors, hardware, & trim (3000 sqft house)",
				"Unit": "ea",
				"Cost": 5500,
				"userInput": "",
				"form_data_description": "new_interior_doors_closet_doors_hardware__trim_3000_sqft_house"
			},
			{
				"Description": "New interior doors, closet doors, hardware, & trim (1500 sqft house)",
				"Unit": "ea",
				"Cost": 3500,
				"userInput": "",
				"form_data_description": "new_interior_doors_closet_doors_hardware__trim_1500_sqft_house"
			}
		]
	},
	{
		"Category": "Doors",
		"Items": [
			{
				"Description": "Interior door-rehung hollow-core door",
				"Unit": "ea",
				"Cost": 175,
				"userInput": "",
				"form_data_description": "interior_doorrehung_hollowcore_door"
			},
			{
				"Description": "Interior sliding closest door",
				"Unit": "ea",
				"Cost": 175,
				"userInput": "",
				"form_data_description": "interior_sliding_closest_door"
			},
			{
				"Description": "Exterior front door-single door w/hardware & dead bolt",
				"Unit": "ea",
				"Cost": 150,
				"userInput": "",
				"form_data_description": "exterior_front_doorsingle_door_whardware__dead_bolt"
			},
			{
				"Description": "Exterior French patio door-double door",
				"Unit": "ea",
				"Cost": 700,
				"userInput": "",
				"form_data_description": "exterior_french_patio_doordouble_door"
			},
			{
				"Description": "Exterior sliding glass door-double door",
				"Unit": "ea",
				"Cost": 850,
				"userInput": "",
				"form_data_description": "exterior_sliding_glass_doordouble_door"
			}
		]
	},
	{
		"Category": "Trim",
		"Items": [
			{
				"Description": "Crown moulding",
				"Unit": "lf",
				"Cost": 3.75,
				"userInput": "",
				"form_data_description": "crown_moulding"
			},
			{
				"Description": "New baseboard trim",
				"Unit": "lf",
				"Cost": 2.75,
				"userInput": "",
				"form_data_description": "new_baseboard_trim"
			},
			{
				"Description": "Raised panel wood wainscoting",
				"Unit": "lf",
				"Cost": 17.5,
				"userInput": "",
				"form_data_description": "raised_panel_wood_wainscoting"
			}
		]
	},
	{
		"Category": "Basement",
		"Items": [
			{
				"Description": "Pour concrete floor in basement",
				"Unit": "sf",
				"Cost": 175,
				"userInput": "",
				"form_data_description": "pour_concrete_floor_in_basement"
			},
			{
				"Description": "Seal basement",
				"Unit": "ea",
				"Cost": 250,
				"userInput": "",
				"form_data_description": "seal_basement"
			},
			{
				"Description": "Install sump pump",
				"Unit": "ea",
				"Cost": 1000,
				"userInput": "",
				"form_data_description": "install_sump_pump"
			},
			{
				"Description": "Install french drains(estimate depending on condition- L x W)",
				"Unit": "lf",
				"Cost": 25,
				"userInput": "",
				"form_data_description": "install_french_drainsestimate_depending_on_condition_l_x_w"
			},
			{
				"Description": "Reframe support beam",
				"Unit": "ea",
				"Cost": 500,
				"userInput": "",
				"form_data_description": "reframe_support_beam"
			}
		]
	},
	{
		"Category": "Foundation",
		"Items": [
			{
				"Description": "Excavation-dig footing trenching",
				"Unit": "lf",
				"Cost": 20,
				"userInput": "",
				"form_data_description": "excavationdig_footing_trenching"
			},
			{
				"Description": "Excavation-backfill of trenches",
				"Unit": "lf",
				"Cost": 10,
				"userInput": "",
				"form_data_description": "excavationbackfill_of_trenches"
			},
			{
				"Description": "New foundation-pour concrete footing",
				"Unit": "lf",
				"Cost": 30,
				"userInput": "",
				"form_data_description": "new_foundationpour_concrete_footing"
			},
			{
				"Description": "New foundation-pour stem wall for single story house",
				"Unit": "lf",
				"Cost": 100,
				"userInput": "",
				"form_data_description": "new_foundationpour_stem_wall_for_single_story_house"
			},
			{
				"Description": "Repair exisitng foundation-($10k min-get quote)",
				"Unit": "ea",
				"Cost": 10000,
				"userInput": "",
				"form_data_description": "repair_exisitng_foundation10k_minget_quote"
			},
			{
				"Description": "Repair existing foundation-stair mud jacking (will vary)",
				"Unit": "ea",
				"Cost": 500,
				"userInput": "",
				"form_data_description": "repair_existing_foundationstair_mud_jacking_will_vary"
			},
			{
				"Description": "Repair existing foundation-bowing walls support with I beams",
				"Unit": "ea",
				"Cost": 500,
				"userInput": "",
				"form_data_description": "repair_existing_foundationbowing_walls_support_with_i_beams"
			},
			{
				"Description": "Repair existing foundation 0 settled walls support w/piers",
				"Unit": "ea",
				"Cost": 850,
				"userInput": "",
				"form_data_description": "repair_existing_foundation_0_settled_walls_support_wpiers"
			}
		]
	},
	{
		"Category": "HVAC Bulk",
		"Items": [
			{
				"Description": "Gas fired forced hot air heating system, ac system, & ductwork",
				"Unit": "ea",
				"Cost": 8000,
				"userInput": "",
				"form_data_description": "gas_fired_forced_hot_air_heating_system_ac_system__ductwork"
			},
			{
				"Description": "Gas fired forced hot air heating system & ductwork",
				"Unit": "ea",
				"Cost": 5000,
				"userInput": "",
				"form_data_description": "gas_fired_forced_hot_air_heating_system__ductwork"
			}
		]
	},
	{
		"Category": "HVAC",
		"Items": [
			{
				"Description": "Gas fired forced hot air unit only",
				"Unit": "ea",
				"Cost": 1700,
				"userInput": "",
				"form_data_description": "gas_fired_forced_hot_air_unit_only"
			},
			{
				"Description": "Air conditioning unit only",
				"Unit": "ea",
				"Cost": 2000,
				"userInput": "",
				"form_data_description": "air_conditioning_unit_only"
			},
			{
				"Description": "Replace forced air ductwork only",
				"Unit": "ea",
				"Cost": 2300,
				"userInput": "",
				"form_data_description": "replace_forced_air_ductwork_only"
			},
			{
				"Description": "Replace boiler & hot water baseboard system",
				"Unit": "ea",
				"Cost": 6500,
				"userInput": "",
				"form_data_description": "replace_boiler__hot_water_baseboard_system"
			},
			{
				"Description": "Replace boiler unit only",
				"Unit": "ea",
				"Cost": 3000,
				"userInput": "",
				"form_data_description": "replace_boiler_unit_only"
			},
			{
				"Description": "Wall heater(install new or remove & replace)",
				"Unit": "ea",
				"Cost": 600,
				"userInput": "",
				"form_data_description": "wall_heaterinstall_new_or_remove__replace"
			},
			{
				"Description": "Service heating & cooling system only",
				"Unit": "ea",
				"Cost": 500,
				"userInput": "",
				"form_data_description": "service_heating__cooling_system_only"
			}
		]
	},
	{
		"Category": "Plumbing Bulk",
		"Items": [
			{
				"Description": "New plumbing system in entire house(1,500sqft 3/2) house",
				"Unit": "ea",
				"Cost": 7000,
				"userInput": "",
				"form_data_description": "new_plumbing_system_in_entire_house1500sqft_32_house"
			}
		]
	},
	{
		"Category": "Plumbing",
		"Items": [
			{
				"Description": "Replace tankless hot water heater",
				"Unit": "ea",
				"Cost": 1500,
				"userInput": "",
				"form_data_description": "replace_tankless_hot_water_heater"
			},
			{
				"Description": "Replace gas hot water heater-40 gallon",
				"Unit": "ea",
				"Cost": 600,
				"userInput": "",
				"form_data_description": "replace_gas_hot_water_heater40_gallon"
			}
		]
	},
	{
		"Category": "Electrical Bulk",
		"Items": [
			{
				"Description": "Rewire entire house, new panel, & lighting fixtures(1,500 sqft)",
				"Unit": "ea",
				"Cost": 7000,
				"userInput": "",
				"form_data_description": "rewire_entire_house_new_panel__lighting_fixtures1500_sqft"
			},
			{
				"Description": "Basic electrical work for house & lighting fixtures(1500 sqft)",
				"Unit": "ea",
				"Cost": 3000,
				"userInput": "",
				"form_data_description": "basic_electrical_work_for_house__lighting_fixtures1500_sqft"
			}
		]
	},
	{
		"Category": "Electrical",
		"Items": [
			{
				"Description": "Replace electric panel only ",
				"Unit": "ea",
				"Cost": 2000,
				"userInput": "",
				"form_data_description": "replace_electric_panel_only_"
			},
			{
				"Description": "Replace all lighting fixtures only (1500 sqft house)",
				"Unit": "ea",
				"Cost": 2000,
				"userInput": "",
				"form_data_description": "replace_all_lighting_fixtures_only_1500_sqft_house"
			}
		]
	},
	{
		"Category": "Demo",
		"Items": [
			{
				"Description": "Demolition work(cost to fill one 40yd dumpster)",
				"Unit": "ea",
				"Cost": 500,
				"userInput": "",
				"form_data_description": "demolition_workcost_to_fill_one_40yd_dumpster"
			},
			{
				"Description": "Dumpster rental(40yard)",
				"Unit": "ea",
				"Cost": 500,
				"userInput": "",
				"form_data_description": "dumpster_rental40yard"
			}
		]
	},
	{
		"Category": "Termites/Abatement/Pests",
		"Items": [
			{
				"Description": "Termite fumigiation & treatment",
				"Unit": "ls",
				"Cost": 1000,
				"userInput": "",
				"form_data_description": "termite_fumigiation__treatment"
			},
			{
				"Description": "Mold removal & abatement-minimum",
				"Unit": "ls",
				"Cost": 2000,
				"userInput": "",
				"form_data_description": "mold_removal__abatementminimum"
			},
			{
				"Description": "Asbestos removal & abatement-minimum",
				"Unit": "ls",
				"Cost": 1500,
				"userInput": "",
				"form_data_description": "asbestos_removal__abatementminimum"
			},
			{
				"Description": "Bed bug or cockroach treament",
				"Unit": "ea",
				"Cost": 800,
				"userInput": "",
				"form_data_description": "bed_bug_or_cockroach_treament"
			}
		]
	},
	{
		"Category": "Permits",
		"Items": [
			{
				"Description": "Construction permits for remodel(city)",
				"Unit": "ea",
				"Cost": 1500,
				"userInput": "",
				"form_data_description": "construction_permits_for_remodelcity"
			},
			{
				"Description": "Construction permits for addition(city) ",
				"Unit": "ea",
				"Cost": 5000,
				"userInput": "",
				"form_data_description": "construction_permits_for_additioncity_"
			},
			{
				"Description": "Construction permits for deck(city)",
				"Unit": "ea",
				"Cost": 600,
				"userInput": "",
				"form_data_description": "construction_permits_for_deckcity"
			},
			{
				"Description": "Construction permits over the counter ",
				"Unit": "ea",
				"Cost": 750,
				"userInput": "",
				"form_data_description": "construction_permits_over_the_counter_"
			},
			{
				"Description": "Construction permits for full submittal(county)",
				"Unit": "ea",
				"Cost": 1500,
				"userInput": "",
				"form_data_description": "construction_permits_for_full_submittalcounty"
			},
			{
				"Description": "Construction permits for addition(county)",
				"Unit": "ea",
				"Cost": 5000,
				"userInput": "",
				"form_data_description": "construction_permits_for_additioncounty"
			},
			{
				"Description": "Construction permits for deck(county)",
				"Unit": "ea",
				"Cost": 600,
				"userInput": "",
				"form_data_description": "construction_permits_for_deckcounty"
			}
		]
	}
]



export const REHAB_CATALOG: RehabCatalog = {
categories: RAW.map((c) => ({
key: slugify(c.Category),
label: c.Category.trim(),
items: (c.Items ?? []).map((it: any) => ({
id: slugify(it.form_data_description ?? it.Description),
description: it.Description,
unit: (it.Unit || 'ea').toLowerCase(),
cost: Number(it.Cost) ?? 0,
}))
}))
};