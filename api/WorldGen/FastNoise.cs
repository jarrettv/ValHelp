using System;

namespace Vh.Numerics;

/// <summary>
/// Minimal reimplementation of the FastNoise library used by Valheim.
/// Only implements the subset used by WorldGenerator: Cellular noise, SimplexFractal.
/// Based on the FastNoise library by Jordan Peck.
/// </summary>
public class FastNoise
{
    public enum NoiseType { Value, ValueFractal, Perlin, PerlinFractal, Simplex, SimplexFractal, Cellular, WhiteNoise, Cubic, CubicFractal }
    public enum CellularDistanceFunction { Euclidean, Manhattan, Natural }
    public enum CellularReturnType { CellValue, NoiseLookup, Distance, Distance2, Distance2Add, Distance2Sub, Distance2Mul, Distance2Div }
    public enum FractalType { FBM, Billow, RigidMulti }

    private int m_seed = 1337;
    private float m_frequency = 0.01f;
    private NoiseType m_noiseType = NoiseType.Simplex;
    private int m_octaves = 3;
    private float m_lacunarity = 2.0f;
    private float m_gain = 0.5f;
    private FractalType m_fractalType = FractalType.FBM;
    private CellularDistanceFunction m_cellularDistanceFunction = CellularDistanceFunction.Euclidean;
    private CellularReturnType m_cellularReturnType = CellularReturnType.CellValue;
    private float m_cellularJitter = 0.45f;

    private float m_fractalBounding;

    public FastNoise(int seed = 1337)
    {
        m_seed = seed;
        CalculateFractalBounding();
    }

    public void SetSeed(int seed) { m_seed = seed; }
    public void SetFrequency(float frequency) { m_frequency = frequency; }
    public void SetNoiseType(NoiseType noiseType) { m_noiseType = noiseType; }
    public void SetFractalOctaves(int octaves) { m_octaves = octaves; CalculateFractalBounding(); }
    public void SetFractalLacunarity(float lacunarity) { m_lacunarity = lacunarity; }
    public void SetFractalGain(float gain) { m_gain = gain; CalculateFractalBounding(); }
    public void SetFractalType(FractalType fractalType) { m_fractalType = fractalType; }
    public void SetCellularDistanceFunction(CellularDistanceFunction cellularDistanceFunction) { m_cellularDistanceFunction = cellularDistanceFunction; }
    public void SetCellularReturnType(CellularReturnType cellularReturnType) { m_cellularReturnType = cellularReturnType; }
    public void SetCellularJitter(float cellularJitter) { m_cellularJitter = cellularJitter; }

    private void CalculateFractalBounding()
    {
        float amp = m_gain;
        float ampFractal = 1.0f;
        for (int i = 1; i < m_octaves; i++)
        {
            ampFractal += amp;
            amp *= m_gain;
        }
        m_fractalBounding = 1.0f / ampFractal;
    }

    // Hash constants from FastNoise
    private const int X_PRIME = 1619;
    private const int Y_PRIME = 31337;
    private const int Z_PRIME = 6971;

    private static int Hash2D(int seed, int x, int y)
    {
        int hash = seed;
        hash ^= X_PRIME * x;
        hash ^= Y_PRIME * y;
        hash *= hash * hash * 60493;
        hash = (hash >> 13) ^ hash;
        return hash;
    }

    private static float ValCoord2D(int seed, int x, int y)
    {
        int n = Hash2D(seed, x, y);
        return n * (1.0f / 2147483648.0f);
    }

    // Pre-computed 2D cellular jitter vectors (256 entries)
    private struct Float2
    {
        public readonly float x, y;
        public Float2(float x, float y) { this.x = x; this.y = y; }
    }

    private static readonly Float2[] CELL_2D = {
        new Float2(-0.2700222198f, -0.9628540911f), new Float2(0.3863092627f, -0.9223693152f),
        new Float2(0.04444859006f, -0.999011673f), new Float2(-0.5992523158f, -0.8005602176f),
        new Float2(-0.7819280288f, 0.6233687174f), new Float2(0.9464672271f, 0.3227999196f),
        new Float2(-0.6514146797f, -0.7587218957f), new Float2(0.9378472289f, 0.347048376f),
        new Float2(-0.8497875957f, -0.5271252623f), new Float2(-0.879042592f, 0.4767432447f),
        new Float2(-0.892300288f, -0.4514423508f), new Float2(-0.379844434f, -0.9250503802f),
        new Float2(-0.9951650832f, 0.0982163789f), new Float2(0.7724397808f, -0.6350880136f),
        new Float2(0.7573283322f, -0.6530343002f), new Float2(-0.9928004525f, -0.119780055f),
        new Float2(-0.0532665713f, 0.9985803285f), new Float2(0.9754253726f, -0.2203300762f),
        new Float2(-0.7665018163f, 0.6422421394f), new Float2(0.991636706f, 0.1290606184f),
        new Float2(-0.994696838f, 0.1028503788f), new Float2(-0.5379205513f, -0.84299554f),
        new Float2(0.5022815471f, -0.8647041387f), new Float2(0.4559821461f, -0.8899889226f),
        new Float2(-0.8659131224f, -0.5001944266f), new Float2(0.0879458407f, -0.9961252577f),
        new Float2(-0.5051684983f, 0.8630207346f), new Float2(0.7753185226f, -0.6315704146f),
        new Float2(-0.6921944612f, 0.7217110418f), new Float2(-0.5191659449f, -0.8546734591f),
        new Float2(0.8978622882f, -0.4402764035f), new Float2(-0.1706774107f, 0.9853269617f),
        new Float2(-0.9353430106f, -0.3537420705f), new Float2(-0.9992404798f, 0.03896746794f),
        new Float2(-0.2882064021f, -0.9575683108f), new Float2(-0.9663811329f, 0.2571137995f),
        new Float2(-0.8759714238f, -0.4823630009f), new Float2(-0.8303123018f, -0.5572983775f),
        new Float2(0.05110133755f, -0.9986934731f), new Float2(-0.8558373281f, -0.5172450752f),
        new Float2(0.09887025282f, 0.9951003332f), new Float2(0.9189016087f, 0.3944867976f),
        new Float2(-0.2439375892f, -0.9697909324f), new Float2(-0.8121409387f, -0.5834613061f),
        new Float2(-0.9910431363f, 0.1335421355f), new Float2(0.8492423985f, -0.5280031709f),
        new Float2(-0.9717838994f, -0.2358729591f), new Float2(0.9949457207f, 0.1004142068f),
        new Float2(0.6241065508f, -0.7813392434f), new Float2(0.662910307f, 0.7486988212f),
        new Float2(-0.7197418176f, 0.6942418282f), new Float2(-0.8143370775f, -0.5803922158f),
        new Float2(0.104521054f, -0.9945226741f), new Float2(-0.1065926113f, -0.9943027784f),
        new Float2(0.445799684f, -0.8951327509f), new Float2(0.105547406f, 0.9944142724f),
        new Float2(-0.992790267f, 0.1198644477f), new Float2(-0.8334366408f, 0.552615025f),
        new Float2(0.9115561563f, -0.4111755999f), new Float2(0.8285544909f, -0.5599084351f),
        new Float2(0.7217097654f, -0.6921957921f), new Float2(0.4940492677f, -0.8694339084f),
        new Float2(-0.3652321272f, -0.9309164803f), new Float2(-0.9696606758f, 0.2444548501f),
        new Float2(0.08925509731f, -0.996008799f), new Float2(0.5354071276f, -0.8445941083f),
        new Float2(-0.1053576186f, 0.9944343981f), new Float2(-0.9890284586f, 0.1477251101f),
        new Float2(0.004856104961f, 0.9999882091f), new Float2(0.9885598478f, 0.1508291331f),
        new Float2(0.9286129562f, -0.3710498316f), new Float2(-0.5832393863f, -0.8123003252f),
        new Float2(0.3015207509f, 0.9534596146f), new Float2(-0.9575110528f, 0.2883965738f),
        new Float2(0.9715802154f, -0.2367105511f), new Float2(0.229981792f, 0.9731949318f),
        new Float2(0.955763816f, -0.2941352207f), new Float2(0.740956116f, 0.6715534485f),
        new Float2(-0.9971513787f, -0.07542630764f), new Float2(0.6905710663f, -0.7232645452f),
        new Float2(-0.290713703f, -0.9568100872f), new Float2(0.5912777791f, -0.8064679708f),
        new Float2(-0.9454592212f, -0.325740481f), new Float2(0.6664455681f, 0.74555369f),
        new Float2(0.6236134912f, 0.7817328275f), new Float2(0.9126993851f, -0.4086316587f),
        new Float2(-0.8191762011f, 0.5735419353f), new Float2(-0.8812745759f, -0.4726046147f),
        new Float2(0.9953313627f, 0.09651672651f), new Float2(0.9855650846f, -0.1692969699f),
        new Float2(-0.8495980887f, 0.5274306472f), new Float2(0.6174853946f, -0.7865823463f),
        new Float2(0.8508156371f, 0.52546432f), new Float2(0.9985032451f, -0.05469249926f),
        new Float2(0.1971371563f, -0.9803759185f), new Float2(0.6607855748f, -0.7505747292f),
        new Float2(-0.03097494063f, 0.9995201614f), new Float2(-0.6731660801f, 0.739491331f),
        new Float2(-0.7195018362f, -0.6944905383f), new Float2(0.9727511689f, 0.2318515979f),
        new Float2(0.9997059088f, -0.0242506907f), new Float2(0.4421787429f, -0.8969269532f),
        new Float2(0.9981350961f, -0.061043673f), new Float2(-0.9173660799f, -0.3980445648f),
        new Float2(-0.8150056635f, -0.5794529907f), new Float2(-0.8789331304f, 0.4769450202f),
        new Float2(0.0158605829f, 0.999874213f), new Float2(-0.8095464474f, 0.5870558317f),
        new Float2(-0.9165898907f, -0.3998286786f), new Float2(-0.8023542565f, 0.5968480938f),
        new Float2(-0.5176737917f, 0.8555780767f), new Float2(-0.8154407307f, -0.5788405779f),
        new Float2(0.4022010347f, -0.9155513791f), new Float2(-0.9052556868f, -0.4248672045f),
        new Float2(0.7317445619f, 0.6815789728f), new Float2(-0.5647632201f, -0.8252529947f),
        new Float2(-0.8403276335f, -0.5420788397f), new Float2(-0.9314281527f, 0.363925262f),
        new Float2(0.5238198472f, 0.8518290719f), new Float2(0.7432803869f, -0.6689800195f),
        new Float2(-0.985371561f, -0.1704197369f), new Float2(0.4601468731f, 0.88784281f),
        new Float2(0.825855404f, 0.5638819483f), new Float2(0.6182366099f, 0.7859920446f),
        new Float2(0.8331502863f, -0.553046653f), new Float2(0.1500307506f, 0.9886813308f),
        new Float2(-0.662330369f, -0.7492119075f), new Float2(-0.668598664f, 0.743623444f),
        new Float2(0.7025606278f, 0.7116238924f), new Float2(-0.5419389763f, -0.8404178401f),
        new Float2(-0.3388616456f, 0.9408362159f), new Float2(0.8331530315f, 0.5530425174f),
        new Float2(-0.2989720662f, -0.9542618632f), new Float2(0.2638522993f, 0.9645630949f),
        new Float2(0.124108739f, -0.9922686234f), new Float2(-0.7282649308f, -0.6852956957f),
        new Float2(0.6962500149f, 0.7177993569f), new Float2(-0.9183535368f, 0.3957610156f),
        new Float2(-0.6326102274f, -0.7744703352f), new Float2(-0.9331891859f, -0.359385508f),
        new Float2(-0.1153779357f, -0.9933216659f), new Float2(0.9514974788f, -0.3076565421f),
        new Float2(-0.08987977445f, -0.9959526224f), new Float2(0.6678496916f, 0.7442961705f),
        new Float2(0.7952400393f, -0.6062947138f), new Float2(-0.6462007402f, -0.7631674805f),
        new Float2(-0.2733598753f, 0.9619118351f), new Float2(0.9669590226f, -0.254931851f),
        new Float2(-0.9792894595f, 0.2024651934f), new Float2(-0.5369502995f, -0.8436138784f),
        new Float2(-0.270036471f, -0.9628500944f), new Float2(-0.6400277131f, 0.7683518247f),
        new Float2(-0.7854537493f, -0.6189203566f), new Float2(0.06005905383f, -0.9981948257f),
        new Float2(-0.02455770378f, 0.9996984141f), new Float2(-0.65983623f, 0.751409442f),
        new Float2(-0.6253894466f, -0.7803127835f), new Float2(-0.6210408851f, -0.7837781695f),
        new Float2(0.8348888491f, 0.5504185768f), new Float2(-0.1592275245f, 0.9872419133f),
        new Float2(0.8367622488f, 0.5475663786f), new Float2(-0.8675753916f, -0.4973056806f),
        new Float2(-0.2022662628f, -0.9793305667f), new Float2(0.9399189937f, 0.3413975472f),
        new Float2(0.9877404807f, -0.1561049093f), new Float2(-0.9034455656f, 0.4287028224f),
        new Float2(0.1269804218f, -0.9919052235f), new Float2(-0.3819600854f, 0.924178821f),
        new Float2(0.9754625894f, 0.2201652486f), new Float2(-0.3204015856f, -0.9472818081f),
        new Float2(-0.9874760884f, 0.1577687387f), new Float2(0.02535348474f, -0.9996785487f),
        new Float2(0.4835130794f, -0.8753371362f), new Float2(-0.2850799925f, -0.9585037287f),
        new Float2(-0.06805516006f, -0.99768156f), new Float2(-0.7885244045f, -0.6150034663f),
        new Float2(0.3185392127f, -0.9479096845f), new Float2(0.8880043089f, 0.4598351306f),
        new Float2(0.6476921488f, -0.7619021462f), new Float2(0.9820241299f, 0.1887554194f),
        new Float2(0.9357275128f, -0.3527237187f), new Float2(-0.8894895414f, 0.4569555293f),
        new Float2(0.7922791302f, 0.6101588153f), new Float2(0.7483818261f, 0.6632681526f),
        new Float2(-0.7288929755f, -0.6846276581f), new Float2(0.8729032783f, -0.4878932944f),
        new Float2(0.8288345784f, 0.5594937369f), new Float2(0.08074567077f, 0.9967347374f),
        new Float2(0.9799148216f, -0.1994165048f), new Float2(-0.580730673f, -0.8140957471f),
        new Float2(-0.4700049791f, -0.8826637636f), new Float2(0.2409492979f, 0.9705377045f),
        new Float2(0.9437816757f, -0.3305694308f), new Float2(-0.8927998638f, -0.4504535528f),
        new Float2(-0.8069622304f, 0.5906030467f), new Float2(0.06258973166f, 0.9980393407f),
        new Float2(-0.9312597469f, 0.3643559849f), new Float2(0.5777449785f, 0.8162173362f),
        new Float2(-0.3360095855f, -0.941858566f), new Float2(0.697932075f, -0.7161639607f),
        new Float2(-0.002008157227f, -0.9999979837f), new Float2(-0.1827294312f, -0.9831632392f),
        new Float2(-0.6523911722f, 0.7578824173f), new Float2(-0.4302626911f, -0.9027037258f),
        new Float2(-0.9985126289f, -0.05452091251f), new Float2(-0.01028102172f, -0.9999471489f),
        new Float2(-0.4946071129f, 0.8691166802f), new Float2(-0.2999350194f, 0.9539596344f),
        new Float2(0.8165471961f, 0.5772786819f), new Float2(0.2697460475f, 0.962931498f),
        new Float2(-0.7306287391f, -0.6827749597f), new Float2(-0.7590952064f, -0.6509796216f),
        new Float2(-0.907053853f, 0.4210146171f), new Float2(-0.5104861064f, -0.8598860013f),
        new Float2(0.8613350597f, 0.5080373165f), new Float2(0.5007881595f, -0.8655698812f),
        new Float2(-0.654158152f, 0.7563577938f), new Float2(-0.8382755311f, -0.545246856f),
        new Float2(0.6940070834f, 0.7199681717f), new Float2(0.06950936031f, 0.9975812994f),
        new Float2(0.1702942185f, -0.9853932612f), new Float2(0.2695973274f, 0.9629731466f),
        new Float2(0.5519612192f, -0.8338697815f), new Float2(0.225657487f, -0.9742067022f),
        new Float2(0.4215262855f, -0.9068161835f), new Float2(0.4881873305f, -0.8727388672f),
        new Float2(-0.3683854996f, -0.9296731273f), new Float2(-0.9825390578f, 0.1860564427f),
        new Float2(0.81256471f, 0.5828709909f), new Float2(0.3196460933f, -0.9475370046f),
        new Float2(0.9570913859f, 0.2897862643f), new Float2(-0.6876655497f, -0.7260276109f),
        new Float2(-0.9988770922f, -0.047376731f), new Float2(-0.1250179027f, 0.992154486f),
        new Float2(-0.8280133617f, 0.560708367f), new Float2(0.9324863769f, -0.3612051451f),
        new Float2(0.6394653183f, 0.7688199442f), new Float2(-0.01623847064f, -0.9998681473f),
        new Float2(-0.9955014666f, -0.09474613458f), new Float2(-0.81453315f, 0.580117012f),
        new Float2(0.4037327978f, -0.9148769469f), new Float2(0.9944263371f, 0.1054336766f),
        new Float2(-0.1624711654f, 0.9867132919f), new Float2(-0.9949487814f, -0.100383875f),
        new Float2(-0.6995302564f, 0.7146029809f), new Float2(0.5263414922f, -0.85027327f),
        new Float2(-0.5395221479f, 0.841971408f), new Float2(0.6579370318f, 0.7530729462f),
        new Float2(0.01426758847f, -0.9998982128f), new Float2(-0.6734383991f, 0.7392433447f),
        new Float2(0.639412098f, -0.7688642071f), new Float2(0.9211571421f, 0.3891908523f),
        new Float2(-0.146637214f, -0.9891903394f), new Float2(-0.782318098f, 0.6228791163f),
        new Float2(-0.5039610839f, -0.8637263605f), new Float2(-0.7743120191f, -0.6328039957f),
    };

    // 2D Cellular noise
    public float GetCellular(double x, double y)
    {
        float fx = (float)x * m_frequency;
        float fy = (float)y * m_frequency;
        return SingleCellular(fx, fy);
    }

    private float SingleCellular(float x, float y)
    {
        int xr = FastRound(x);
        int yr = FastRound(y);

        float distance = 999999f;
        int xc = 0, yc = 0;

        switch (m_cellularDistanceFunction)
        {
            default:
            case CellularDistanceFunction.Euclidean:
                for (int xi = xr - 1; xi <= xr + 1; xi++)
                {
                    for (int yi = yr - 1; yi <= yr + 1; yi++)
                    {
                        Float2 vec = CELL_2D[Hash2D(m_seed, xi, yi) & 255];

                        float vecX = xi - x + vec.x * m_cellularJitter;
                        float vecY = yi - y + vec.y * m_cellularJitter;

                        float newDistance = vecX * vecX + vecY * vecY;

                        if (newDistance < distance)
                        {
                            distance = newDistance;
                            xc = xi;
                            yc = yi;
                        }
                    }
                }
                break;
            case CellularDistanceFunction.Manhattan:
                for (int xi = xr - 1; xi <= xr + 1; xi++)
                {
                    for (int yi = yr - 1; yi <= yr + 1; yi++)
                    {
                        Float2 vec = CELL_2D[Hash2D(m_seed, xi, yi) & 255];

                        float vecX = xi - x + vec.x * m_cellularJitter;
                        float vecY = yi - y + vec.y * m_cellularJitter;

                        float newDistance = Math.Abs(vecX) + Math.Abs(vecY);

                        if (newDistance < distance)
                        {
                            distance = newDistance;
                            xc = xi;
                            yc = yi;
                        }
                    }
                }
                break;
            case CellularDistanceFunction.Natural:
                for (int xi = xr - 1; xi <= xr + 1; xi++)
                {
                    for (int yi = yr - 1; yi <= yr + 1; yi++)
                    {
                        Float2 vec = CELL_2D[Hash2D(m_seed, xi, yi) & 255];

                        float vecX = xi - x + vec.x * m_cellularJitter;
                        float vecY = yi - y + vec.y * m_cellularJitter;

                        float newDistance = (Math.Abs(vecX) + Math.Abs(vecY)) + (vecX * vecX + vecY * vecY);

                        if (newDistance < distance)
                        {
                            distance = newDistance;
                            xc = xi;
                            yc = yi;
                        }
                    }
                }
                break;
        }

        switch (m_cellularReturnType)
        {
            case CellularReturnType.CellValue:
                return ValCoord2D(m_seed, xc, yc);
            case CellularReturnType.Distance:
                return distance;
            default:
                return distance;
        }
    }

    // 2D Simplex fractal
    public float GetSimplexFractal(double x, double y)
    {
        float fx = (float)x * m_frequency;
        float fy = (float)y * m_frequency;

        switch (m_fractalType)
        {
            case FractalType.FBM:
                return SingleSimplexFractalFBM(fx, fy);
            case FractalType.Billow:
                return SingleSimplexFractalBillow(fx, fy);
            case FractalType.RigidMulti:
                return SingleSimplexFractalRigidMulti(fx, fy);
            default:
                return SingleSimplexFractalFBM(fx, fy);
        }
    }

    private float SingleSimplexFractalFBM(float x, float y)
    {
        int seed = m_seed;
        float sum = SingleSimplex(seed, x, y);
        float amp = 1.0f;

        for (int i = 1; i < m_octaves; i++)
        {
            x *= m_lacunarity;
            y *= m_lacunarity;
            amp *= m_gain;
            sum += SingleSimplex(++seed, x, y) * amp;
        }

        return sum * m_fractalBounding;
    }

    private float SingleSimplexFractalBillow(float x, float y)
    {
        int seed = m_seed;
        float sum = Math.Abs(SingleSimplex(seed, x, y)) * 2.0f - 1.0f;
        float amp = 1.0f;

        for (int i = 1; i < m_octaves; i++)
        {
            x *= m_lacunarity;
            y *= m_lacunarity;
            amp *= m_gain;
            sum += (Math.Abs(SingleSimplex(++seed, x, y)) * 2.0f - 1.0f) * amp;
        }

        return sum * m_fractalBounding;
    }

    private float SingleSimplexFractalRigidMulti(float x, float y)
    {
        int seed = m_seed;
        float sum = 1.0f - Math.Abs(SingleSimplex(seed, x, y));
        float amp = 1.0f;

        for (int i = 1; i < m_octaves; i++)
        {
            x *= m_lacunarity;
            y *= m_lacunarity;
            amp *= m_gain;
            sum -= (1.0f - Math.Abs(SingleSimplex(++seed, x, y))) * amp;
        }

        return sum;
    }

    // 2D Simplex noise
    private static readonly float F2 = (float)(1.0 / 2.0) * ((float)Math.Sqrt(3.0) - 1.0f);
    private static readonly float G2 = (3.0f - (float)Math.Sqrt(3.0)) / 6.0f;

    private static readonly float[] GRAD_2D = {
        -1, -1, 1, -1, -1, 1, 1, 1,
        0, -1, -1, 0, 0, 1, 1, 0
    };

    private static float GradCoord2D(int seed, int x, int y, float xd, float yd)
    {
        int hash = Hash2D(seed, x, y);
        int idx = hash & 7;
        return xd * GRAD_2D[idx * 2] + yd * GRAD_2D[idx * 2 + 1];
    }

    private static float SingleSimplex(int seed, float x, float y)
    {
        float t = (x + y) * F2;
        int i = FastFloor(x + t);
        int j = FastFloor(y + t);

        t = (i + j) * G2;
        float X0 = i - t;
        float Y0 = j - t;

        float x0 = x - X0;
        float y0 = y - Y0;

        int i1, j1;
        if (x0 > y0) { i1 = 1; j1 = 0; }
        else { i1 = 0; j1 = 1; }

        float x1 = x0 - i1 + G2;
        float y1 = y0 - j1 + G2;
        float x2 = x0 - 1.0f + 2.0f * G2;
        float y2 = y0 - 1.0f + 2.0f * G2;

        float n0, n1, n2;

        t = 0.5f - x0 * x0 - y0 * y0;
        if (t < 0) n0 = 0;
        else { t *= t; n0 = t * t * GradCoord2D(seed, i, j, x0, y0); }

        t = 0.5f - x1 * x1 - y1 * y1;
        if (t < 0) n1 = 0;
        else { t *= t; n1 = t * t * GradCoord2D(seed, i + i1, j + j1, x1, y1); }

        t = 0.5f - x2 * x2 - y2 * y2;
        if (t < 0) n2 = 0;
        else { t *= t; n2 = t * t * GradCoord2D(seed, i + 1, j + 1, x2, y2); }

        return 50.0f * (n0 + n1 + n2);
    }

    private static int FastFloor(float f) => f >= 0 ? (int)f : (int)f - 1;
    private static int FastRound(float f) => f >= 0 ? (int)(f + 0.5f) : (int)(f - 0.5f);
}
