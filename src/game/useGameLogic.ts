export interface PoseDefinition {
    id: string;
    name: string;
    imageUrl: string;
    targetId: string;
}

export const LEVELS: PoseDefinition[][] = [
    //Lvl 1: 2 poses
    [
        {
            id: "id_1",
            name: "name1",
            imageUrl: "url1",
            targetId: "targetId1",
        },

            {
            id: "id_2",
            name: "name2",
            imageUrl: "url2",
            targetId: "targetId2",
        },

    ],

//Lvl 2: 4 poses
    [
        {
            id: "id_3",
            name: "name3",
            imageUrl: "url3",
            targetId: "targetId3",
        },

        {
            id: "id_4",
            name: "name4",
            imageUrl: "url4",
            targetId: "targetId4",
        },

        {
            id: "id_5",
            name: "name5",
            imageUrl: "url5",
            targetId: "targetId5",
        },

            {
            id: "id_6",
            name: "name6",
            imageUrl: "url6",
            targetId: "targetId6",
        },

    ],


];

