#!/usr/bin/env python3
"""Generates app/src/main/assets/vehicle_catalogue.json (Indian car + bike brands incl. EVs).
Model id convention: <brandId>-<slug(model)>. Fuel codes: P=petrol D=diesel C=CNG E=electric H=hybrid."""
import json, re, os

F = {"P": "PETROL", "D": "DIESEL", "C": "CNG", "E": "ELECTRIC", "H": "HYBRID"}
CARS = {
    ("maruti-suzuki", "Maruti Suzuki"): {"Alto K10": "PC", "S-Presso": "PC", "Celerio": "PC", "Wagon R": "PC", "Swift": "PC", "Dzire": "PC", "Baleno": "PC", "Ignis": "P", "Fronx": "PC", "Brezza": "PC", "Ertiga": "PC", "XL6": "PC", "Grand Vitara": "PCH", "Jimny": "P", "Ciaz": "P", "Invicto": "H", "eVitara": "E", "Eeco": "PC"},
    ("hyundai", "Hyundai"): {"Grand i10 Nios": "PC", "i20": "P", "Aura": "PC", "Exter": "PC", "Venue": "PD", "Verna": "P", "Creta": "PD", "Creta Electric": "E", "Alcazar": "PD", "Tucson": "PD", "Ioniq 5": "E"},
    ("tata", "Tata"): {"Tiago": "PC", "Tiago EV": "E", "Tigor": "PC", "Tigor EV": "E", "Altroz": "PDC", "Punch": "PC", "Punch EV": "E", "Nexon": "PDC", "Nexon EV": "E", "Curvv": "PD", "Curvv EV": "E", "Harrier": "D", "Harrier EV": "E", "Safari": "D"},
    ("mahindra", "Mahindra"): {"Thar": "PD", "Thar Roxx": "PD", "Scorpio N": "PD", "Scorpio Classic": "D", "XUV 3XO": "PD", "XUV700": "PD", "Bolero": "D", "Bolero Neo": "D", "XUV400": "E", "BE 6": "E", "XEV 9e": "E"},
    ("kia", "Kia"): {"Sonet": "PD", "Seltos": "PD", "Carens": "PD", "Syros": "PD", "Carnival": "D", "EV6": "E", "EV9": "E"},
    ("toyota", "Toyota"): {"Glanza": "PC", "Urban Cruiser Taisor": "PC", "Urban Cruiser Hyryder": "PCH", "Rumion": "PC", "Innova Crysta": "D", "Innova Hycross": "PH", "Fortuner": "PD", "Hilux": "D", "Camry": "H"},
    ("honda", "Honda"): {"Amaze": "P", "City": "P", "City e:HEV": "H", "Elevate": "P"},
    ("mg", "MG"): {"Comet EV": "E", "Windsor EV": "E", "ZS EV": "E", "Astor": "P", "Hector": "PD", "Gloster": "D"},
    ("skoda", "Skoda"): {"Kylaq": "P", "Kushaq": "P", "Slavia": "P", "Kodiaq": "P"},
    ("volkswagen", "Volkswagen"): {"Taigun": "P", "Virtus": "P", "Tiguan": "P"},
    ("renault", "Renault"): {"Kwid": "P", "Triber": "P", "Kiger": "P"},
    ("nissan", "Nissan"): {"Magnite": "P"},
    ("citroen", "Citroen"): {"C3": "P", "eC3": "E", "Basalt": "P", "C3 Aircross": "P"},
    ("jeep", "Jeep"): {"Compass": "D", "Meridian": "D", "Wrangler": "P"},
    ("byd", "BYD"): {"Atto 3": "E", "Seal": "E", "eMAX 7": "E", "Sealion 7": "E"},
    ("bmw", "BMW"): {"3 Series": "PD", "5 Series": "PD", "X1": "PD", "X5": "PD", "iX1": "E", "i4": "E"},
    ("mercedes-benz", "Mercedes-Benz"): {"A-Class Limousine": "PD", "C-Class": "PD", "E-Class": "PD", "GLA": "PD", "GLC": "PD", "EQS": "E"},
    ("audi", "Audi"): {"A4": "P", "A6": "P", "Q3": "P", "Q5": "P", "Q8 e-tron": "E"},
    ("volvo", "Volvo"): {"XC40 Recharge": "E", "XC60": "H", "XC90": "H"},
    ("force", "Force Motors"): {"Gurkha": "D"},
    ("isuzu", "Isuzu"): {"D-Max V-Cross": "D", "MU-X": "D"},
}
BIKES = {
    ("hero", "Hero"): {"Splendor Plus": "P", "HF Deluxe": "P", "Passion Plus": "P", "Glamour": "P", "Super Splendor": "P", "Xtreme 125R": "P", "Xtreme 160R": "P", "Xpulse 200 4V": "P", "Mavrick 440": "P", "Destini 125": "P", "Xoom 110": "P", "Pleasure Plus": "P"},
    ("honda-2w", "Honda"): {"Activa 6G": "P", "Activa 125": "P", "Activa e:": "E", "Dio": "P", "Shine 100": "P", "Shine 125": "P", "SP 125": "P", "Unicorn": "P", "Hornet 2.0": "P", "CB350": "P", "Hness CB350": "P"},
    ("bajaj", "Bajaj"): {"Platina 100": "P", "CT 110X": "P", "Pulsar 125": "P", "Pulsar N160": "P", "Pulsar NS200": "P", "Pulsar N250": "P", "Avenger 220": "P", "Dominar 400": "P", "Freedom 125": "PC", "Chetak": "E"},
    ("tvs", "TVS"): {"Jupiter": "P", "Jupiter 125": "P", "NTorq 125": "P", "XL100": "P", "Raider 125": "P", "Apache RTR 160": "P", "Apache RTR 200 4V": "P", "Apache RR 310": "P", "Ronin": "P", "iQube": "E", "Radeon": "P"},
    ("royal-enfield", "Royal Enfield"): {"Classic 350": "P", "Bullet 350": "P", "Hunter 350": "P", "Meteor 350": "P", "Goan Classic 350": "P", "Himalayan 450": "P", "Guerrilla 450": "P", "Scram 440": "P", "Interceptor 650": "P", "Continental GT 650": "P", "Super Meteor 650": "P"},
    ("yamaha", "Yamaha"): {"FZ-S Fi": "P", "FZ-X": "P", "MT-15": "P", "R15 V4": "P", "Fascino 125": "P", "RayZR 125": "P", "Aerox 155": "P"},
    ("suzuki-2w", "Suzuki"): {"Access 125": "P", "Burgman Street": "P", "Avenis": "P", "Gixxer": "P", "Gixxer SF 250": "P", "V-Strom SX": "P"},
    ("ktm", "KTM"): {"125 Duke": "P", "200 Duke": "P", "250 Duke": "P", "390 Duke": "P", "RC 390": "P", "390 Adventure": "P"},
    ("jawa-yezdi", "Jawa / Yezdi"): {"Jawa 42": "P", "Jawa 350": "P", "Perak": "P", "Yezdi Roadster": "P", "Yezdi Adventure": "P"},
    ("triumph", "Triumph"): {"Speed 400": "P", "Scrambler 400 X": "P"},
    ("harley-davidson", "Harley-Davidson"): {"X440": "P"},
    ("ather", "Ather", True): {"Rizta": "E", "450S": "E", "450X": "E", "450 Apex": "E"},
    ("ola-electric", "Ola Electric", True): {"S1 X": "E", "S1 Air": "E", "S1 Pro": "E", "Roadster X": "E"},
    ("revolt", "Revolt", True): {"RV400": "E", "RV1": "E"},
    ("ultraviolette", "Ultraviolette", True): {"F77 Mach 2": "E"},
    ("simple-energy", "Simple Energy", True): {"Simple One": "E"},
    ("okinawa", "Okinawa", True): {"Praise Pro": "E", "iPraise+": "E"},
    ("hero-electric", "Hero Electric", True): {"Optima CX": "E", "Photon": "E"},
    ("vida", "Vida (Hero)", True): {"V2 Plus": "E", "V2 Pro": "E"},
}

def slug(s): return re.sub(r"[^a-z0-9]+", "-", s.lower()).strip("-")

def brands(spec, vtype):
    out = []
    for key, models in spec.items():
        bid, name = key[0], key[1]
        ev_only = len(key) > 2 or all(f == "E" for f in models.values())
        out.append({"id": bid, "name": name, "type": vtype, "evOnly": ev_only,
                    "models": [{"id": f"{bid}-{slug(m)}", "name": m, "fuels": [F[c] for c in codes]} for m, codes in models.items()]})
    return out

data = {"brands": brands(CARS, "CAR") + brands(BIKES, "BIKE")}
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
path = os.path.join(root, "app/src/main/assets/vehicle_catalogue.json")
with open(path, "w") as f: json.dump(data, f, indent=1)
print(path, len(data["brands"]), "brands", sum(len(b["models"]) for b in data["brands"]), "models")
