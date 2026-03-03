
import { supabase } from './src/infrastructure/db/supabaseClient';
import { gameState } from './src/core/engine/gameState';

async function testTick() {
    const innId = 'fc36098f-fbcd-4d42-b05b-d3ca6c68da5b'; // From terminal output
    gameState.setIdentifiers('8307544f-4b84-426a-a9c7-ae51438ee777', '00000000-0000-0000-0000-000000000002', innId);

    console.log('Testing tickGameClock for Inn:', innId);
    try {
        const { data, error } = await supabase.rpc('tick_game_clock', { p_inn_id: innId, ticks_to_add: 10 });
        if (error) {
            console.error('RPC Error:', error);
        } else {
            console.log('RPC Success, new tick:', data);
        }
    } catch (e) {
        console.error('Caught Exception:', e);
    }
}

testTick();
