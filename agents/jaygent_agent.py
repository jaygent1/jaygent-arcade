#!/usr/bin/env python3
"""
Jay Gent Arcade - Self-Registering Game Agent
Registers itself, then plays Void Rush with a simple AI strategy.
"""

import requests
import time
import json
import os
import random
from pathlib import Path

BASE_URL = "https://www.jaygent.gg"
CONFIG_FILE = Path(__file__).parent / "agent_config.json"

class JayGentAgent:
    def __init__(self, name="OpenClaw-Agent"):
        self.name = name
        self.api_key = None
        self.agent_id = None
        self.session = requests.Session()
        self.load_config()
    
    def load_config(self):
        """Load saved API key if exists."""
        if CONFIG_FILE.exists():
            try:
                config = json.loads(CONFIG_FILE.read_text())
                self.api_key = config.get("api_key")
                self.agent_id = config.get("agent_id")
                self.name = config.get("name", self.name)
                print(f"✓ Loaded existing agent: {self.name} ({self.agent_id})")
            except Exception as e:
                print(f"⚠ Could not load config: {e}")
    
    def save_config(self):
        """Save API key for future use."""
        CONFIG_FILE.parent.mkdir(parents=True, exist_ok=True)
        CONFIG_FILE.write_text(json.dumps({
            "api_key": self.api_key,
            "agent_id": self.agent_id,
            "name": self.name
        }, indent=2))
        print(f"✓ Saved config to {CONFIG_FILE}")
    
    def register(self):
        """Register as a new agent."""
        if self.api_key:
            # Verify existing key works
            try:
                r = self.session.get(
                    f"{BASE_URL}/api/agents/me",
                    headers={"X-API-Key": self.api_key}
                )
                if r.status_code == 200:
                    profile = r.json()
                    print(f"✓ Agent verified: {profile['name']} (best score: {profile['bestScore']})")
                    return True
            except:
                pass
            print("⚠ Existing API key invalid, re-registering...")
        
        # Register new agent
        print(f"Registering agent '{self.name}'...")
        
        # Add random suffix if name taken
        name = self.name
        for attempt in range(5):
            try:
                r = self.session.post(
                    f"{BASE_URL}/api/agents/register",
                    json={
                        "name": name,
                        "description": "OpenClaw AI Agent - Testing the arcade games!",
                        "contact": "openclaw-agent"
                    }
                )
                
                if r.status_code == 200:
                    data = r.json()
                    self.api_key = data["apiKey"]
                    self.agent_id = data["agentId"]
                    self.name = data["name"]
                    print(f"✓ Registered successfully!")
                    print(f"  Agent ID: {self.agent_id}")
                    print(f"  Display Name: {data['displayName']}")
                    self.save_config()
                    return True
                elif "already taken" in r.text.lower():
                    # Try with random suffix
                    name = f"{self.name}-{random.randint(100, 999)}"
                    print(f"  Name taken, trying: {name}")
                else:
                    print(f"✗ Registration failed: {r.text}")
                    return False
            except Exception as e:
                print(f"✗ Registration error: {e}")
                return False
        
        return False
    
    def get_headers(self):
        """Get headers with API key."""
        headers = {"Content-Type": "application/json"}
        if self.api_key:
            headers["X-API-Key"] = self.api_key
        return headers
    
    def play_void_rush(self, max_ticks=10000, verbose=True):
        """Play a game of Void Rush."""
        print("\n🚀 Starting Void Rush...")
        
        # Start game
        try:
            r = self.session.post(
                f"{BASE_URL}/api/games/void-rush/start",
                headers=self.get_headers(),
                json={}
            )
            if r.status_code != 200:
                print(f"✗ Could not start game: {r.text}")
                return None
            
            data = r.json()
            session_id = data["sessionId"]
            state = data["state"]
            print(f"  Session: {session_id}")
            if data.get("agent"):
                print(f"  Playing as: {data['agent']['name']}")
        except Exception as e:
            print(f"✗ Start error: {e}")
            return None
        
        # Game loop
        tick = 0
        last_score = 0
        last_wave = 0
        
        while tick < max_ticks:
            tick += 1
            
            # Simple AI decision making
            action = self.decide_action(state)
            
            # Send action
            try:
                r = self.session.post(
                    f"{BASE_URL}/api/games/void-rush/{session_id}/action",
                    headers=self.get_headers(),
                    json={**action, "ticks": 5}  # Run 5 ticks per request
                )
                
                if r.status_code != 200:
                    print(f"✗ Action error: {r.text}")
                    break
                
                data = r.json()
                state = data["state"]
                
                # Check game over
                if data.get("gameOver") or state.get("state") == "game_over":
                    results = data.get("results", state)
                    score = results.get("score", state.get("score", 0))
                    wave = results.get("wave", state.get("wave", 1))
                    print(f"\n💀 Game Over!")
                    print(f"   Score: {score}")
                    print(f"   Wave: {wave}")
                    print(f"   Ticks: {tick * 5}")
                    
                    # Submit score with API key
                    self.submit_score(score, wave, "void-rush")
                    
                    return {"score": score, "wave": wave, "ticks": tick * 5}
                
                # Progress update
                if state["score"] != last_score or state["wave"] != last_wave:
                    if verbose:
                        print(f"  Wave {state['wave']} | Score: {state['score']} | Lives: {state['lives']}")
                    last_score = state["score"]
                    last_wave = state["wave"]
                
            except Exception as e:
                print(f"✗ Error: {e}")
                break
            
            # Small delay to be nice to the server
            time.sleep(0.01)
        
        print("⏱ Max ticks reached")
        return None
    
    def decide_action(self, state):
        """Simple AI to decide next action."""
        action = {
            "left": False,
            "right": False,
            "up": False,
            "down": False,
            "shoot": True,  # Always shooting
            "bomb": False
        }
        
        player = state.get("player", {})
        px, py = player.get("x", 275), player.get("y", 580)
        
        enemies = state.get("enemies", [])
        enemy_bullets = state.get("enemyBullets", [])
        powerups = state.get("powerups", [])
        boss = state.get("boss")
        
        # Priority 1: Dodge enemy bullets
        danger_bullets = [b for b in enemy_bullets 
                         if abs(b["x"] - px) < 40 and b["y"] > py - 150 and b["y"] < py]
        
        if danger_bullets:
            # Find safest direction
            avg_x = sum(b["x"] for b in danger_bullets) / len(danger_bullets)
            if avg_x > px:
                action["left"] = True
            else:
                action["right"] = True
            # Also move up if bullets are close
            closest = min(danger_bullets, key=lambda b: py - b["y"])
            if py - closest["y"] < 80:
                action["up"] = True
        
        # Priority 2: Collect powerups
        elif powerups:
            nearest = min(powerups, key=lambda p: abs(p["x"] - px) + abs(p["y"] - py))
            if abs(nearest["x"] - px) > 20:
                action["right" if nearest["x"] > px else "left"] = True
            if abs(nearest["y"] - py) > 20:
                action["down" if nearest["y"] > py else "up"] = True
        
        # Priority 3: Attack enemies/boss
        elif boss:
            # Circle around boss
            bx, by = boss["x"], boss["y"]
            target_x = bx + 100 * (1 if px < bx else -1)
            if abs(px - target_x) > 30:
                action["right" if target_x > px else "left"] = True
            # Stay in lower half
            if py < 400:
                action["down"] = True
            elif py > 550:
                action["up"] = True
        
        elif enemies:
            # Move toward nearest enemy (horizontally)
            nearest = min(enemies, key=lambda e: abs(e["x"] - px))
            if abs(nearest["x"] - px) > 30:
                action["right" if nearest["x"] > px else "left"] = True
            # Stay in lower area
            if py < 450:
                action["down"] = True
        
        # Priority 4: Use bomb if overwhelmed
        if len(danger_bullets) > 5 or (len(enemies) > 15 and state.get("bombs", 0) > 0):
            action["bomb"] = True
        
        return action
    
    def submit_score(self, score, wave, game="void-rush"):
        """Submit score to leaderboard."""
        try:
            r = self.session.post(
                f"{BASE_URL}/api/scores",
                headers=self.get_headers(),
                json={
                    "score": score,
                    "wave": wave,
                    "game": game,
                    "playerType": "AGENT"
                }
            )
            if r.status_code == 200:
                print(f"   ✓ Score submitted!")
            else:
                print(f"   ⚠ Score submission: {r.text}")
        except Exception as e:
            print(f"   ⚠ Score submission error: {e}")
    
    def get_profile(self):
        """Get current agent profile."""
        if not self.api_key:
            return None
        
        try:
            r = self.session.get(
                f"{BASE_URL}/api/agents/me",
                headers={"X-API-Key": self.api_key}
            )
            if r.status_code == 200:
                return r.json()
        except:
            pass
        return None
    
    def run_test_session(self, games=3):
        """Run a test session with multiple games."""
        print("=" * 50)
        print("🎩 JAY GENT ARCADE - AGENT TEST SESSION")
        print("=" * 50)
        
        # Register/verify
        if not self.register():
            print("✗ Could not register agent")
            return
        
        # Play games
        results = []
        for i in range(games):
            print(f"\n--- Game {i+1}/{games} ---")
            result = self.play_void_rush(verbose=True)
            if result:
                results.append(result)
            time.sleep(1)
        
        # Summary
        if results:
            print("\n" + "=" * 50)
            print("📊 SESSION SUMMARY")
            print("=" * 50)
            print(f"Games played: {len(results)}")
            print(f"Best score: {max(r['score'] for r in results)}")
            print(f"Best wave: {max(r['wave'] for r in results)}")
            print(f"Avg score: {sum(r['score'] for r in results) // len(results)}")
            
            # Get updated profile
            profile = self.get_profile()
            if profile:
                print(f"\n📈 Agent Stats:")
                print(f"  Total games: {profile['gamesPlayed']}")
                print(f"  Best score: {profile['bestScore']}")
                print(f"  Best wave: {profile['bestWave']}")


def main():
    import sys
    
    name = "OpenClaw-Agent"
    games = 3
    
    # Parse args
    if len(sys.argv) > 1:
        name = sys.argv[1]
    if len(sys.argv) > 2:
        games = int(sys.argv[2])
    
    agent = JayGentAgent(name=name)
    agent.run_test_session(games=games)


if __name__ == "__main__":
    main()
