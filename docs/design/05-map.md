# 05 Map tab (stub)

Status: stub. The Map tab comes after Player, World and Notes. This file records only what was asked for and what must be decided before a real spec can be written. It has no layout and no behaviour.

## Purpose

Show the real world on a map and let the table mark it up, so that where things are and where things happened can be seen as well as read.

## What was asked for

- A real world map.
- Pins and other annotations on it, including drawn shapes.
- Possibly satellite imagery.
- OpenStreetMap-style sources were mentioned as a starting point.

## What the other specs leave ready for it

Three kinds of record carry an optional place so that the Map tab has something to show when it arrives. See `00-ontology.md` for their definitions.

- An event can have a place.
- An asset can have a location.
- A character's identity includes a location, with a dated history.

Until the Map tab exists, a place is text only.

## Features

| Feature | When |
| --- | --- |
| World map with pan and zoom | Later |
| Pins | Later |
| Drawn shapes (lines, areas) | Later |
| Satellite imagery | Later, if a usable source is found |
| Events, assets and characters shown at their places | Later |

## Gaps

Nothing below is decided. Each needs an answer before this stub becomes a spec.

1. **What a place is.** Free text, a point on the map, or a named place that several records share. Recommendation: a named place with an optional point, so that "Chicago" is entered once and reused.
2. **Borders.** The setting is alternate history, so borders change. Whether the map shows today's borders, period borders, or borders the table draws. Recommendation: a plain modern base map with borders drawn by the table as shapes, since no period map will match a diverged world.
3. **Time.** Whether the map shows the world at the current game date only, or can be moved through time alongside the timeline. Recommendation: current date first, with each pin and shape carrying a date range so a time control can be added.
4. **Where map imagery comes from.** Online tiles need a connection and have usage terms; bundled data is large. The table's earlier direction is a local-network server with no outside service. Recommendation: decide after a short survey of sources and their terms.
5. **Satellite imagery.** Modern imagery shows a modern world, which may not suit a game set in another period. Recommendation: confirm it is still wanted once the base map exists.
6. **Who can annotate.** Whether pins and shapes have the same three visibility levels as notes, accounts and events. Recommendation: yes, for consistency.
7. **Links.** Whether a pin can open a note, an event or a character, and whether those can open the map at their place. Recommendation: yes in both directions.
