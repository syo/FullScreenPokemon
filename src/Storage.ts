import { Component } from "eightbittr/lib/Component";
import { IItems } from "itemsholdr/lib/IItemsHoldr";

import { PokedexListingStatus } from "./Constants";
import { FullScreenPokemon } from "./FullScreenPokemon";
import {
    ICharacter, IPokedex, IPokedexInformation,
    IPokemonListing, ISaveFile, IStateSaveable
} from "./IFullScreenPokemon";

/**
 * Storage functions used by FullScreenPokemon instances.
 */
export class Storage<TEightBittr extends FullScreenPokemon> extends Component<TEightBittr> {
    /**
     * Clears the data saved in localStorage and saves it in a new object in localStorage
     * upon a new game being started.
     */
    public clearSavedData(): void {
        const oldLocalStorage: IItems = this.eightBitter.itemsHolder.exportItems();

        const collectionKeys: string[] = this.eightBitter.itemsHolder.getItem("stateCollectionKeys");
        if (collectionKeys) {
            for (const collection of collectionKeys) {
                oldLocalStorage[collection] = this.eightBitter.itemsHolder.getItem(collection);
            }
        }

        for (const key of this.eightBitter.itemsHolder.getKeys()) {
            this.eightBitter.itemsHolder.removeItem(key);
        }

        this.eightBitter.itemsHolder.clear();
        this.eightBitter.itemsHolder.setItem("oldLocalStorage", oldLocalStorage);
        this.eightBitter.itemsHolder.saveItem("oldLocalStorage");
        this.eightBitter.itemsHolder.setItem("stateCollectionKeys", []);

        this.eightBitter.UserWrapper.resetControls();
    }

    /**
     * Checks to see if oldLocalStorage is defined in localStorage; if that is true and a prior game
     * hasn't been saved, the data is restored under localStorage.
     */
    public checkForOldStorageData(): void {
        if (!this.eightBitter.itemsHolder.getItem("oldLocalStorage") || this.eightBitter.itemsHolder.getItem("gameStarted")) {
            return;
        }

        const oldLocalStorage: IItems = this.eightBitter.itemsHolder.getItem("oldLocalStorage");
        for (const key in oldLocalStorage) {
            if (!oldLocalStorage.hasOwnProperty(key)) {
                continue;
            }

            if (key.slice(0, "StateHolder".length) === "StateHolder") {
                this.eightBitter.StateHolder.setCollection(key.slice(11), oldLocalStorage[key]);
            } else {
                this.eightBitter.itemsHolder.setItem(key, oldLocalStorage[key]);
            }
        }

        this.eightBitter.itemsHolder.saveAll();

        this.eightBitter.UserWrapper.resetControls();
    }

    /**
     * Saves all persistant information about the current game state.
     * 
     * @param showText   Whether to display a status menu (by default, false).
     */
    public saveGame(showText: boolean = true): void {
        const ticksRecorded: number = this.eightBitter.fpsAnalyzer.getNumRecorded();

        this.eightBitter.itemsHolder.increase("time", ticksRecorded - this.eightBitter.ticksElapsed);
        this.eightBitter.ticksElapsed = ticksRecorded;

        this.saveCharacterPositions();
        this.eightBitter.StateHolder.saveCollection();
        this.eightBitter.itemsHolder.saveAll();

        if (!showText) {
            return;
        }

        this.eightBitter.MenuGrapher.createMenu("GeneralText");
        this.eightBitter.MenuGrapher.addMenuDialog("GeneralText", ["Now saving..."]);

        this.eightBitter.timeHandler.addEvent(
            (): void => this.eightBitter.MenuGrapher.deleteAllMenus(),
            49);
    }

    /**
     * Automatically saves the game.
     */
    public autoSave(): void {
        if (this.eightBitter.itemsHolder.getAutoSave()
            && !this.eightBitter.scenePlayer.getCutscene()
            && this.eightBitter.areaSpawner.getMapName() !== "Blank") {
            this.saveGame(false);
        }
    }

    /**
     * Saves current game state and downloads
     * it onto the client's computer as a JSON file.
     */
    public downloadSaveGame(): void {
        this.saveGame();

        const link: HTMLAnchorElement = document.createElement("a");
        link.setAttribute(
            "download",
            "FullScreenPokemon Save " + Date.now() + ".json");
        link.setAttribute(
            "href",
            "data:text/json;charset=utf-8," + encodeURIComponent(
                JSON.stringify(this.eightBitter.itemsHolder.exportItems())));

        this.eightBitter.container.appendChild(link);
        link.click();
        this.eightBitter.container.removeChild(link);
    }

    /**
     * Loads JSON game data from a data string and sets it as the game state,
     * then starts gameplay.
     * 
     * @param dataRaw   Raw data to be parsed as JSON.
     */
    public loadData(dataRaw: string): void {
        this.clearSavedData();
        const data: ISaveFile = JSON.parse(dataRaw);
        const keyStart: string = "StateHolder::";

        for (const key in data) {
            if (!data.hasOwnProperty(key)) {
                continue;
            }

            if (key.slice(0, keyStart.length) === keyStart) {
                const split: string[] = key.split("::");
                this.eightBitter.StateHolder.setCollection(split[1] + "::" + split[2], data[key]);
            } else {
                this.eightBitter.itemsHolder.setItem(key, data[key]);
            }
        }

        this.eightBitter.MenuGrapher.deleteActiveMenu();
        this.eightBitter.UserWrapper.resetControls();
        this.eightBitter.gameplay.startPlay();
        this.eightBitter.itemsHolder.setItem("gameStarted", true);
    }

    /**
     * Saves the positions of all Characters in the game.
     */
    public saveCharacterPositions(): void {
        for (const character of this.eightBitter.groupHolder.getGroup("Character") as ICharacter[]) {
            this.saveCharacterPosition(character, character.id);
        }
    }

    /**
     * Saves the position of a certain Character.
     * 
     * @param character   An in-game Character.
     * @param id   The ID associated with the Character.
     */
    public saveCharacterPosition(character: ICharacter, id: string): void {
        this.eightBitter.StateHolder.addChange(
            id,
            "xloc",
            (character.left + this.eightBitter.MapScreener.left) / this.eightBitter.unitsize);
        this.eightBitter.StateHolder.addChange(
            id,
            "yloc",
            (character.top + this.eightBitter.MapScreener.top) / this.eightBitter.unitsize);
        this.eightBitter.StateHolder.addChange(
            id,
            "direction",
            character.direction);
    }

    /**
     * Pushes and saves the current state of a variable to a stack.
     * 
     * @param thing   The Thing, Area, Map, or Location saving its state of a variable.
     * @param title   Name for the state being saved.
     * @param value   The values of the variable to be saved.
     */
    public addStateHistory(thing: IStateSaveable, title: string, value: any): void {
        if (!thing.state) {
            thing.state = {};
        }

        const stateHistory: any[] = thing.state[title];
        if (stateHistory) {
            stateHistory.push(value);
        } else {
            thing.state[title] = [value];
        }
    }

    /**
     * Updates to the most recently saved state for a variable.
     * 
     * @param thing   The Thing having its state restored.
     * @param title   The name of the state to restore.
     */
    public popStateHistory(thing: IStateSaveable, title: string): void {
        if (!thing.state) {
            throw new Error(`State property is not defined for '${thing}'.`);
        }

        const stateHistory: any[] = thing.state[title];
        if (!stateHistory || stateHistory.length === 0) {
            throw new Error(`No state saved for '${title}'.`);
        }

        (thing as any)[title] = stateHistory.pop();
    }

    /**
     * Adds an in-game item to the character's bag.
     * 
     * @param item    The item being stored.
     * @param amount   The quantity of this item being stored.
     */
    public addItemToBag(item: string, amount: number = 1): void {
        this.eightBitter.utilities.combineArrayMembers(
            this.eightBitter.itemsHolder.getItem("items"),
            item,
            amount,
            "item",
            "amount");
    }

    /**
     * Adds a Pokemon by title to the Pokedex.
     * 
     * @param titleRaw   The raw title of the Pokemon.
     * @param status   Whether the Pokemon has been seen and caught.
     */
    public addPokemonToPokedex(titleRaw: string[], status: PokedexListingStatus): void {
        const pokedex: IPokedex = this.eightBitter.itemsHolder.getItem("Pokedex");
        const title: string = titleRaw.join("");
        const caught: boolean = status === PokedexListingStatus.Caught;
        const seen: boolean = caught || (status === PokedexListingStatus.Seen);
        let information: IPokedexInformation = pokedex[title];

        if (information) {
            // Skip potentially expensive storage operations if they're unnecessary
            if (information.caught || (information.seen && status >= PokedexListingStatus.Seen)) {
                return;
            }

            information.caught = information.caught || (status >= PokedexListingStatus.Caught);
            information.seen = information.seen || (status >= PokedexListingStatus.Seen);
        } else {
            pokedex[title] = information = {
                caught: caught,
                seen: seen,
                title: titleRaw
            };
        }

        this.eightBitter.itemsHolder.setItem("Pokedex", pokedex);
    }

    /**
     * Retrieves known Pokedex listings in ascending order. Unknown Pokemon are
     * replaced with `undefined`.
     * 
     * @returns Pokedex listings in ascending order.
     */
    public getPokedexListingsOrdered(): (IPokedexInformation | undefined)[] {
        const pokedex: IPokedex = this.eightBitter.itemsHolder.getItem("Pokedex");
        const pokemon: { [i: string]: IPokemonListing } = this.eightBitter.mathDecider.getConstant("pokemon");
        const titlesSorted: string[] = Object.keys(pokedex)
            .sort((a: string, b: string): number => pokemon[a].number - pokemon[b].number);
        let i: number;

        if (!titlesSorted.length) {
            return [];
        }

        const ordered: (IPokedexInformation | undefined)[] = [];

        for (i = 0; i < pokemon[titlesSorted[0]].number - 1; i += 1) {
            ordered.push(undefined);
        }

        for (i = 0; i < titlesSorted.length - 1; i += 1) {
            ordered.push(pokedex[titlesSorted[i]]);

            for (let j: number = pokemon[titlesSorted[i]].number - 1; j < pokemon[titlesSorted[i + 1]].number - 2; j += 1) {
                ordered.push(undefined);
            }
        }

        ordered.push(pokedex[titlesSorted[i]]);

        return ordered;
    }
}
